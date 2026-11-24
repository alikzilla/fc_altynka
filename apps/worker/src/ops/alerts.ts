import { escapeHtml, TIME_ZONE } from '@altynka/core';
import { Api } from 'grammy';
import { asc, eq, gt, lt, max, min, count, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { opsIncidents, opsState } from '../db/schema';
import type { Env } from '../env';

/** Откуда пришёл сбой. `client_error` — ошибка мини-аппа у игрока. */
export type IncidentKind = 'api_error' | 'bot_update_failed' | 'cron_failed' | 'client_error';

const KIND_LABEL: Record<IncidentKind, string> = {
  api_error: 'API',
  bot_update_failed: 'Бот',
  cron_failed: 'Крон',
  client_error: 'Мини-апп',
};

/** Между двумя алертами не меньше получаса: при череде ошибок приходит одна сводка, а не сообщение каждые 5 минут. */
export const ALERT_INTERVAL_MS = 30 * 60_000;
/** Столько необработанных апдейтов в очереди вебхука считаем затором. */
export const PENDING_UPDATES_LIMIT = 20;
/** Крон считается остановившимся, если не отрабатывал дольше этого (он запускается каждые 5 минут). */
export const CRON_STALE_MS = 15 * 60_000;
/** Записи старше этого срока удаляются: разбирать старые сбои нужно по логам Cloudflare. */
const RETENTION_MS = 14 * 86_400_000;
const DETAIL_MAX = 300;

const STATE = {
  lastIncidentId: 'alert.last_incident_id',
  lastSentAt: 'alert.last_sent_at',
  lastWebhookError: 'alert.last_webhook_error_date',
  cronRanAt: 'cron.ran_at',
} as const;

/**
 * Записать сбой для ближайшей сводки. Никогда не бросает: запись идёт из обработчиков ошибок,
 * и вторая ошибка (например, недоступна D1) не должна заменить исходную.
 */
export async function recordIncident(db: Db, kind: IncidentKind, detail: string, now: number): Promise<void> {
  try {
    await db.insert(opsIncidents).values({ at: now, kind, detail: detail.slice(0, DETAIL_MAX) });
  } catch (e) {
    console.error(JSON.stringify({ event: 'incident_not_recorded', kind, error: String(e) }));
  }
}

async function readState(db: Db): Promise<Map<string, string>> {
  return new Map((await db.select().from(opsState)).map(r => [r.key, r.value]));
}

async function writeState(db: Db, entries: Record<string, string | number>): Promise<void> {
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value: String(value) }));
  if (!rows.length) return;
  await db.insert(opsState).values(rows).onConflictDoUpdate({ target: opsState.key, set: { value: sql`excluded.value` } });
}

/** Отметка «крон жив» — по ней `/api/health` отвечает 503, если крон перестал запускаться. */
export async function markCronRan(db: Db, now: number): Promise<void> {
  await writeState(db, { [STATE.cronRanAt]: now });
}

/** Крон отрабатывал давно. Свежая установка без отметок — не сбой. */
export async function cronIsStale(db: Db, now: number): Promise<boolean> {
  const row = (await db.select().from(opsState).where(eq(opsState.key, STATE.cronRanAt)))[0];
  return !!row && now - Number(row.value) > CRON_STALE_MS;
}

export interface WebhookHealth { lastErrorDate?: number; lastErrorMessage?: string; pending: number }

/** Что нужно алертам от Telegram: отправить сообщение администратору и прочитать состояние вебхука. */
export interface OpsTelegram {
  send(chatId: number, html: string): Promise<void>;
  webhookInfo(): Promise<WebhookHealth>;
}

export function makeOpsTelegram(env: Pick<Env, 'BOT_TOKEN'>): OpsTelegram {
  const api = new Api(env.BOT_TOKEN);
  return {
    async send(chatId, html) {
      await api.sendMessage(chatId, html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    },
    async webhookInfo() {
      const w = await api.getWebhookInfo();
      return { lastErrorDate: w.last_error_date, lastErrorMessage: w.last_error_message, pending: w.pending_update_count };
    },
  };
}

const clock = (ms: number) => new Intl.DateTimeFormat('ru-RU', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);

export interface AlertResult { sent: boolean; incidents: number }

/**
 * Раз в 5 минут из крона: если появились новые сбои или Telegram видит ошибку вебхука, присылает администратору
 * одну сводку. Не чаще раза в `ALERT_INTERVAL_MS`; пока интервал не прошёл, сбои копятся до следующей сводки.
 * Без получателя (`ALERT_CHAT_ID` пуст) ничего не отправляет, но старые записи всё равно чистит.
 */
export async function checkAlerts(d: { db: Db; now: number; tg: OpsTelegram; chatId: number | null }): Promise<AlertResult> {
  await d.db.delete(opsIncidents).where(lt(opsIncidents.at, d.now - RETENTION_MS));
  if (!d.chatId) return { sent: false, incidents: 0 };
  const state = await readState(d.db);
  const lastSentAt = Number(state.get(STATE.lastSentAt) ?? 0);
  if (d.now - lastSentAt < ALERT_INTERVAL_MS) return { sent: false, incidents: 0 };

  const lastId = Number(state.get(STATE.lastIncidentId) ?? 0);
  // Сводка по видам, а не все строки: при лавине ошибок их могут быть тысячи.
  const kinds = await d.db.select({ kind: opsIncidents.kind, n: count(), lastId: max(opsIncidents.id), from: min(opsIncidents.at), to: max(opsIncidents.at) })
    .from(opsIncidents).where(gt(opsIncidents.id, lastId)).groupBy(opsIncidents.kind).orderBy(asc(min(opsIncidents.id)));
  const latest = kinds.length ? await d.db.select({ id: opsIncidents.id, detail: opsIncidents.detail }).from(opsIncidents)
    .where(inArray(opsIncidents.id, kinds.map(k => k.lastId!))) : [];
  const detailOf = new Map(latest.map(r => [r.id, r.detail]));
  const total = kinds.reduce((s, k) => s + k.n, 0);

  let webhook: WebhookHealth | null = null;
  try { webhook = await d.tg.webhookInfo(); }
  catch (e) { console.warn(JSON.stringify({ event: 'webhook_info_failed', error: String(e) })); }
  const lastWebhookError = Number(state.get(STATE.lastWebhookError) ?? 0);
  // Telegram помнит последнюю ошибку бессрочно: ошибка старше суток (например, до первого запуска алертов) — не новость.
  const freshWebhookError = webhook?.lastErrorDate && webhook.lastErrorDate > lastWebhookError
    && webhook.lastErrorDate * 1000 > d.now - 86_400_000 ? webhook : null;
  const jammed = webhook && webhook.pending >= PENDING_UPDATES_LIMIT ? webhook.pending : 0;

  if (!total && !freshWebhookError && !jammed) return { sent: false, incidents: 0 };

  const lines = ['⚠️ <b>Сбои в продакшене</b>'];
  if (total) {
    const from = Math.min(...kinds.map(k => k.from!)), to = Math.max(...kinds.map(k => k.to!));
    lines.push(from === to ? `${clock(from)}, Алматы` : `${clock(from)} — ${clock(to)}, Алматы`, '');
    for (const k of kinds) {
      const label = KIND_LABEL[k.kind as IncidentKind] ?? k.kind;
      lines.push(`• <b>${escapeHtml(label)}</b> × ${k.n}. Последняя: <code>${escapeHtml(detailOf.get(k.lastId!) ?? '')}</code>`);
    }
  }
  if (freshWebhookError) lines.push(`• <b>Вебхук</b>: Telegram получил ошибку в ${clock(freshWebhookError.lastErrorDate! * 1000)}: <code>${escapeHtml(freshWebhookError.lastErrorMessage ?? '')}</code>`);
  if (jammed) lines.push(`• <b>Вебхук</b>: в очереди ${jammed} необработанных обновлений`);
  lines.push('', 'Подробности: Cloudflare → Workers → fc-altynka → Logs');

  try {
    await d.tg.send(d.chatId, lines.join('\n'));
  } catch (e) {
    // Состояние не сдвигаем: та же сводка уйдёт следующим прогоном крона.
    console.error(JSON.stringify({ event: 'alert_not_sent', error: String(e) }));
    return { sent: false, incidents: total };
  }
  await writeState(d.db, {
    [STATE.lastSentAt]: d.now,
    ...(total ? { [STATE.lastIncidentId]: Math.max(...kinds.map(k => k.lastId!)) } : {}),
    ...(freshWebhookError ? { [STATE.lastWebhookError]: freshWebhookError.lastErrorDate! } : {}),
  });
  return { sent: true, incidents: total };
}
