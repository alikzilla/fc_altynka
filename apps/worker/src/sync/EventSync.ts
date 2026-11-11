import { DurableObject } from 'cloudflare:workers';
import { matchStartsAt } from '@altynka/core';
import { getDb } from '../db/client';
import { getCommunity } from '../domain/members';
import type { Env } from '../env';
import { renderNotice } from '../render/notices';
import { makeTgClient, TgMessageGone, TgRateLimited, TgRejected, type TgClient } from '../telegram/client';
import { getMessageId, loadEventView, renderPart, resolveNotice, setMessageId } from './parts';
import { mergeNotices, nextAlarmAt, unmerge } from './plan';
import type { Notice, Part, SyncRequest } from './port';
import { PersonalDelivery, type DeliveryReport } from './personal';
import { miniAppLink } from '../telegram/links';
import { getEvent } from '../domain/events';
import { AutomaticNotifications } from './automatic';
import { ensureGameReview } from '../domain/ratings';

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
  async deliveryReport(): Promise<DeliveryReport | null> { return (await this.ctx.storage.get<DeliveryReport>('deliveryReport')) ?? null; }
  async request(eventId: number, req: SyncRequest): Promise<void> {
    const s = this.ctx.storage;
    const dirty = new Set<Part>([...((await s.get<Part[]>('dirty')) ?? []), ...req.parts]);
    const pending = [...((await s.get<Notice[]>('pending')) ?? []), ...(req.notices ?? [])];
    await s.put({ eventId, dirty: [...dirty], pending });
    if (req.review) await s.put('auto:reviewArmed', true);
    if (req.parts.includes('bill') && await s.get<number>('auto:billArmedAt') === undefined) await s.put('auto:billArmedAt', Date.now());
    if (req.notices?.some(n => n.kind === 'reminder')) await s.put({
      deliveryReport: { at: Date.now(), sent: 0, unavailable: 0, skipped: 0, failed: 0, status: 'queued' } satisfies DeliveryReport,
      reminderProgress: {},
    });
    const next = Math.max(nextAlarmAt(Date.now(), (await s.get<number>('lastSentAt')) ?? null), (await s.get<number>('retryNotBefore')) ?? 0);
    const alarm = await s.getAlarm();
    // A kickoff alarm may be days away; new edits still flush promptly. A 429 keeps priority.
    if (alarm === null || next < alarm) await s.setAlarm(next);
  }

  async alarm(): Promise<void> {
    const s = this.ctx.storage;
    const eventId = await s.get<number>('eventId');
    if (eventId === undefined) return;
    const retryNotBefore = await s.get<number>('retryNotBefore');
    if (retryNotBefore !== undefined && retryNotBefore > Date.now()) {
      await s.setAlarm(retryNotBefore);
      return;
    }
    const event = await getEvent(getDb(this.env.DB), eventId);
    const community = event ? await getCommunity(getDb(this.env.DB), event.communityId) : null;
    if (!community?.active) return;
    if (!event || event.communityId !== community.id || event.telegramChatId !== null && event.telegramChatId !== community.tgChatId) {
      await s.put({ dirty: [], pending: [] });
      return;
    }
    try { await ensureGameReview({db:getDb(this.env.DB),now:Date.now(),sync:{request:async()=>{}}},eventId); }
    catch (error) { await s.setAlarm(Date.now()+5000); throw error; }
    // Забираем накопленное сразу: request() во время отправки допишет новое, и оно не затрётся.
    const dirty = new Set((await s.get<Part[]>('dirty')) ?? []);
    const kickoff = event.protocolVersion === 0 && event.status === 'scheduled' ? matchStartsAt(event) : null;
    if (kickoff !== null && kickoff <= Date.now() && (await s.get<number>('kickoffHandled')) !== kickoff) {
      dirty.add('event');
      await s.put('kickoffHandled', kickoff);
    }
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
    if (dirty.has('bill')) {
      if (stopped(run)) run.parts.push('bill');
      else try { await new PersonalDelivery(getDb(this.env.DB), this.env, tg, s, community.tgChatId).payments(eventId); }
      catch (e) { if (noteError(run, e)) run.parts.push('bill'); }
    }
    if (stopped(run)) run.notices = pending;
    else await this.sendNotices(tg, community.tgChatId, eventId, pending, run);

    const automatic = new AutomaticNotifications(getDb(this.env.DB), this.env, tg, s, community.tgChatId);
    if (!stopped(run)) {
      try { await automatic.run(eventId); }
      catch (e) { noteError(run, e); }
    }

    await this.putBack(run);
    if (run.retryAt !== null) {
      await s.put('retryNotBefore', run.retryAt);
      return void (await s.setAlarm(run.retryAt));
    }
    if (run.failure !== null) {
      await s.setAlarm(Date.now() + 5000);
      throw run.failure;
    }
    const more = ((await s.get<Part[]>('dirty')) ?? []).length > 0 || ((await s.get<Notice[]>('pending')) ?? []).length > 0;
    // Ставим будильник сами: тот, что request() поставил во время прогона, считал от старого lastSentAt.
    if (more) await s.setAlarm(nextAlarmAt(Date.now(), (await s.get<number>('lastSentAt')) ?? null));
    else {
      await s.delete('retryNotBefore');
      const latest = await getEvent(getDb(this.env.DB), eventId);
      const nextKickoff = latest?.protocolVersion === 0 && latest.status === 'scheduled' ? matchStartsAt(latest) : null;
      const nextAutomatic = await automatic.nextAt(eventId);
      const deadlines = [nextKickoff !== null && nextKickoff > Date.now() ? nextKickoff : null, nextAutomatic]
        .filter((at): at is number => at !== null);
      if (deadlines.length) await s.setAlarm(Math.min(...deadlines));
    }
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
        const personal = new PersonalDelivery(db, this.env, tg, this.ctx.storage, chatId);
        const notice = await personal.notice(await resolveNotice(db, view, m), view);
        if (personal.error instanceof TgRateLimited) throw personal.error;
        const html = notice.kind === 'reminder' && !notice.debtors.length ? '' : renderNotice(notice, view);
        if (html.trim()) {
          const keyboard = { inline_keyboard: [[{ text: notice.kind === 'reminder' ? 'Открыть оплату' : 'Открыть матч', url: miniAppLink(this.env, `${notice.kind === 'reminder' ? 'b' : 'e'}${eventId}`) }]] };
          // Successful group sends are remembered while private failures retry the same notice.
          const key = `groupNotice:${m.kind}`;
          if (m.kind === 'reminder' || (await this.ctx.storage.get<string>(key)) !== html) {
            await tg.sendMessage(chatId, html, { replyTo, keyboard });
            await this.ctx.storage.put(key, html);
            await personal.groupNoticeSent(notice);
            await this.ctx.storage.put('lastSentAt', Date.now());
          }
        }
        if (personal.error !== null) throw personal.error;
        if (personal.more) run.notices.push(...unmerge(m));
        else await personal.completeNotice(notice);
      } catch (e) {
        if (m.kind === 'reminder') {
          const report = await this.ctx.storage.get<DeliveryReport>('deliveryReport');
          if (report) await this.ctx.storage.put('deliveryReport', { ...report, status: e instanceof TgRejected ? 'complete' : 'retrying', failed: Math.max(1, report.failed) });
        }
        if (noteError(run, e)) run.notices.push(...unmerge(m));
      }
    }
  }
}
