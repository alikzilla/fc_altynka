import { DurableObject } from 'cloudflare:workers';
import { getDb } from '../db/client';
import { getCommunity } from '../domain/members';
import type { Env } from '../env';
import { renderNotice } from '../render/notices';
import { makeTgClient, TgMessageGone, TgRateLimited, type TgClient } from '../telegram/client';
import { getMessageId, loadEventView, renderPart, resolveNotice, setMessageId } from './parts';
import { mergeNotices, nextAlarmAt, unmerge } from './plan';
import type { Notice, Part, SyncRequest } from './port';

const PART_ORDER: Part[] = ['event', 'teams', 'bill'];

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
    const db = getDb(this.env.DB);
    const community = await getCommunity(db);
    if (!community) return;
    const tg = makeTgClient(this.env);
    try {
      await this.flushParts(tg, community.tgChatId, eventId);
      await this.flushNotices(tg, community.tgChatId, eventId);
    } catch (e) {
      if (e instanceof TgRateLimited) {
        await s.setAlarm(Date.now() + e.retryAfterSec * 1000);
        return;
      }
      throw e;
    }
  }

  private async flushParts(tg: TgClient, chatId: number, eventId: number): Promise<void> {
    const s = this.ctx.storage;
    const db = getDb(this.env.DB);
    const dirty = new Set((await s.get<Part[]>('dirty')) ?? []);
    for (const part of PART_ORDER.filter(p => dirty.has(p))) {
      const r = await renderPart(db, this.env, eventId, part);
      if (r) {
        const id = await getMessageId(db, eventId, part);
        let sent = false;
        if (id !== null) {
          try {
            await tg.editMessage(chatId, id, r.html, r.keyboard);
            sent = true;
          } catch (e) {
            if (!(e instanceof TgMessageGone)) throw e;
          }
        }
        if (!sent) {
          const replyTo = part === 'event' ? undefined : ((await getMessageId(db, eventId, 'event')) ?? undefined);
          const m = await tg.sendMessage(chatId, r.html, { replyTo, keyboard: r.keyboard });
          await setMessageId(db, eventId, part, m.messageId);
          if (part === 'event') await tg.pinMessage(chatId, m.messageId);
        }
        await s.put('lastSentAt', Date.now());
      }
      dirty.delete(part);
      await s.put('dirty', [...dirty]);
    }
  }

  private async flushNotices(tg: TgClient, chatId: number, eventId: number): Promise<void> {
    const s = this.ctx.storage;
    const db = getDb(this.env.DB);
    const pending = (await s.get<Notice[]>('pending')) ?? [];
    if (!pending.length) return;
    const view = await loadEventView(db, eventId);
    if (!view) {
      await s.put('pending', []);
      return;
    }
    const merged = mergeNotices(pending, new Set(view.main.map(p => p.signupId)));
    const replyTo = (await getMessageId(db, eventId, 'event')) ?? undefined;
    for (let i = 0; i < merged.length; i++) {
      const html = renderNotice(await resolveNotice(db, view, merged[i]), view);
      if (html.trim()) {
        await tg.sendMessage(chatId, html, { replyTo });
        await s.put('lastSentAt', Date.now());
      }
      await s.put('pending', merged.slice(i + 1).flatMap(unmerge));
    }
    if (!merged.length) await s.put('pending', []);
  }
}
