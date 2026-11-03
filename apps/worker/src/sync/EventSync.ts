import { DurableObject } from 'cloudflare:workers';
import { getDb } from '../db/client';
import { getCommunity } from '../domain/members';
import type { Env } from '../env';
import { renderNotice } from '../render/notices';
import { makeTgClient, TgMessageGone, TgRateLimited, TgRejected, type TgClient } from '../telegram/client';
import { getMessageId, loadEventView, renderPart, resolveNotice, setMessageId } from './parts';
import { mergeNotices, nextAlarmAt, unmerge } from './plan';
import type { Notice, Part, SyncRequest } from './port';

const PART_ORDER: Part[] = ['event', 'teams', 'bill'];

/** Итог одного прогона alarm. */
interface Run {
  /** Неотправленное: вернётся в хранилище. */
  parts: Part[];
  notices: Notice[];
  /** 429: когда можно повторить; до тех пор чату больше ничего не шлём. */
  retryAt: number | null;
  /** Сбой сети или базы: остальное всё равно шлём, а alarm потом упадёт, и рантайм повторит его с отступом. */
  failure: unknown;
}

const stopped = (r: Run) => r.retryAt !== null;

/** Запоминает ошибку; false — Telegram отклонил запрос насовсем, повторять незачем. */
function noteError(r: Run, e: unknown): boolean {
  if (e instanceof TgRateLimited) r.retryAt = Date.now() + e.retryAfterSec * 1000;
  else if (e instanceof TgRejected) {
    console.error('telegram rejected, dropping', e.message);
    return false;
  } else r.failure = e;
  return true;
}

/**
 * Один объект на сбор. Копит, что нужно обновить, и раз в ≥3 с отправляет в Telegram
 * актуальное состояние из базы; при 429 ждёт retry_after и повторяет.
 */
export class EventSync extends DurableObject<Env> {
  async request(eventId: number, req: SyncRequest): Promise<void> {
    const s = this.ctx.storage;
    const dirty = new Set<Part>([...((await s.get<Part[]>('dirty')) ?? []), ...req.parts]);
    const pending = [...((await s.get<Notice[]>('pending')) ?? []), ...(req.notices ?? [])];
    await s.put({ eventId, dirty: [...dirty], pending });
    if ((await s.getAlarm()) === null) {
      await s.setAlarm(nextAlarmAt(Date.now(), (await s.get<number>('lastSentAt')) ?? null));
    }
  }

  async alarm(): Promise<void> {
    const s = this.ctx.storage;
    const eventId = await s.get<number>('eventId');
    if (eventId === undefined) return;
    const community = await getCommunity(getDb(this.env.DB));
    if (!community) return;
    // Забираем накопленное сразу: request() во время отправки допишет новое, и оно не затрётся.
    const dirty = new Set((await s.get<Part[]>('dirty')) ?? []);
    const pending = (await s.get<Notice[]>('pending')) ?? [];
    await s.put({ dirty: [], pending: [] });

    const tg = makeTgClient(this.env);
    const run: Run = { parts: [], notices: [], retryAt: null, failure: null };
    for (const part of PART_ORDER.filter(p => dirty.has(p))) {
      if (stopped(run)) {
        run.parts.push(part);
        continue;
      }
      try {
        await this.sendPart(tg, community.tgChatId, eventId, part);
      } catch (e) {
        if (noteError(run, e)) run.parts.push(part);
      }
    }
    if (stopped(run)) run.notices = pending;
    else await this.sendNotices(tg, community.tgChatId, eventId, pending, run);

    await this.putBack(run);
    if (run.retryAt !== null) return void (await s.setAlarm(run.retryAt));
    if (run.failure !== null) throw run.failure;
    const more = ((await s.get<Part[]>('dirty')) ?? []).length > 0 || ((await s.get<Notice[]>('pending')) ?? []).length > 0;
    // Ставим будильник сами: тот, что request() поставил во время прогона, считал от старого lastSentAt.
    if (more) await s.setAlarm(nextAlarmAt(Date.now(), (await s.get<number>('lastSentAt')) ?? null));
  }

  /** Неотправленное — перед тем, что успело прийти за время прогона. */
  private async putBack(run: Run): Promise<void> {
    if (!run.parts.length && !run.notices.length) return;
    const s = this.ctx.storage;
    const dirty = new Set([...run.parts, ...((await s.get<Part[]>('dirty')) ?? [])]);
    const pending = [...run.notices, ...((await s.get<Notice[]>('pending')) ?? [])];
    await s.put({ dirty: [...dirty], pending });
  }

  private async sendPart(tg: TgClient, chatId: number, eventId: number, part: Part): Promise<void> {
    const db = getDb(this.env.DB);
    const r = await renderPart(db, this.env, eventId, part);
    if (!r) return;
    const id = await getMessageId(db, eventId, part);
    if (id !== null) {
      try {
        await tg.editMessage(chatId, id, r.html, r.keyboard);
        await this.ctx.storage.put('lastSentAt', Date.now());
        return;
      } catch (e) {
        if (!(e instanceof TgMessageGone)) throw e;
      }
    }
    const replyTo = part === 'event' ? undefined : ((await getMessageId(db, eventId, 'event')) ?? undefined);
    const m = await tg.sendMessage(chatId, r.html, { replyTo, keyboard: r.keyboard });
    await setMessageId(db, eventId, part, m.messageId);
    if (part === 'event') await tg.pinMessage(chatId, m.messageId);
    await this.ctx.storage.put('lastSentAt', Date.now());
  }

  private async sendNotices(tg: TgClient, chatId: number, eventId: number, pending: Notice[], run: Run): Promise<void> {
    if (!pending.length) return;
    const db = getDb(this.env.DB);
    let view, replyTo;
    try {
      view = await loadEventView(db, eventId);
      replyTo = (await getMessageId(db, eventId, 'event')) ?? undefined;
    } catch (e) {
      if (noteError(run, e)) run.notices = pending;
      return;
    }
    if (!view) return;
    for (const m of mergeNotices(pending, new Set(view.main.map(p => p.signupId)))) {
      if (stopped(run)) {
        run.notices.push(...unmerge(m));
        continue;
      }
      try {
        const html = renderNotice(await resolveNotice(db, view, m), view);
        if (!html.trim()) continue;
        await tg.sendMessage(chatId, html, { replyTo });
        await this.ctx.storage.put('lastSentAt', Date.now());
      } catch (e) {
        if (noteError(run, e)) run.notices.push(...unmerge(m));
      }
    }
  }
}
