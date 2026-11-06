import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { memberships, users, type UserRow } from '../db/schema';
import { billDto, getBillByEvent } from '../domain/bills';
import { communityByChat } from '../domain/members';
import type { Env } from '../env';
import type { EventView, PersonView, Rendered } from '../render/eventMessage';
import type { OutNotice } from '../render/notices';
import { personalMovement, personalPayment } from '../render/personal';
import { TgForbidden, TgMessageGone, TgRateLimited, TgRejected, type TgClient } from '../telegram/client';
import { loadEventView } from './parts';

export const REMINDER_GAP_MS = 24 * 3600_000;
interface DeliveryState { messageId: number; fingerprint: string; sentAt: number; }
export interface DeliveryReport { at: number; sent: number; unavailable: number; skipped: number; failed: number; status: 'queued' | 'complete' | 'retrying'; }

/** Per-event recipient state lives alongside the durable alarm queue, never in process memory. */
export class PersonalDelivery {
  error: unknown = null;
  private report: DeliveryReport = { at: Date.now(), sent: 0, unavailable: 0, skipped: 0, failed: 0, status: 'complete' };
  constructor(private db: Db, private env: Env, private tg: TgClient, private storage: DurableObjectStorage, private chatId: number) {}

  /** Automatic deliveries use the same opt-in, membership and error handling, without group fallback. */
  async automatic(tgId: number, key: string, rendered: Rendered): Promise<boolean | null> {
    return this.deliver(tgId, key, rendered, false, true);
  }

  private failure(e: unknown) {
    this.report.failed++;
    this.report.status = 'retrying';
    if (e instanceof TgRateLimited || this.error === null) this.error = e;
  }

  private async user(tgId: number): Promise<UserRow | null> {
    const [u] = await this.db.select().from(users).where(eq(users.tgId, tgId));
    const community = await communityByChat(this.db, this.chatId);
    if (!u?.pmAvailable || !community?.active) return null;
    if (!u.notificationsEnabled) return null;
    const [member] = await this.db.select().from(memberships)
      .where(and(eq(memberships.communityId, community.id), eq(memberships.userId, u.id)));
    if (!member) return null;
    return await this.tg.isMember(this.chatId, tgId) ? u : null;
  }

  private async deliver(tgId: number, key: string, rendered: Rendered, editOnly = false, force = false): Promise<boolean | null> {
    // null means retry, false means private delivery is unavailable (eligible for group fallback).
    if (this.error instanceof TgRateLimited) return null;
    try {
      const u = await this.user(tgId);
      if (!u) { this.report.unavailable++; return false; }
      const previous = await this.storage.get<DeliveryState>(key);
      const fingerprint = JSON.stringify(rendered);
      if (!force && previous?.fingerprint === fingerprint) { this.report.skipped++; return true; }
      if (editOnly) {
        if (!previous) return true;
        try { await this.tg.editMessage(tgId, previous.messageId, rendered.html, rendered.keyboard); }
        catch (e) { if (!(e instanceof TgMessageGone)) throw e; return true; }
        await this.storage.put(key, { ...previous, fingerprint });
      } else {
        if (previous) {
          // Retire old transfer controls before replacing the only durable message pointer.
          const old = JSON.parse(previous.fingerprint) as Rendered;
          try { await this.tg.editMessage(tgId, previous.messageId, old.html, { inline_keyboard: [] }); }
          catch (e) { if (!(e instanceof TgMessageGone)) throw e; }
        }
        const message = await this.tg.sendMessage(tgId, rendered.html, { keyboard: rendered.keyboard });
        await this.storage.put(key, { messageId: message.messageId, fingerprint, sentAt: Date.now() } satisfies DeliveryState);
        this.report.sent++;
      }
      return true;
    } catch (e) {
      if (e instanceof TgForbidden) {
        await this.db.update(users).set({ pmAvailable: false }).where(eq(users.tgId, tgId));
        this.report.unavailable++; return false;
      }
      if (e instanceof TgRejected) { console.error('personal message rejected', e.message); this.report.unavailable++; return false; }
      this.failure(e); return null;
    }
  }

  async payments(eventId: number): Promise<void> {
    const view = await loadEventView(this.db, eventId);
    const raw = await getBillByEvent(this.db, eventId);
    if (!view || !raw) return;
    const bill = await billDto(this.db, raw.id);
    const [receiver] = await this.db.select().from(users).where(eq(users.id, raw.receiverUserId));
    for (const line of bill.lines) {
      const [u] = await this.db.select().from(users).where(eq(users.id, line.userId));
      if (!u) continue;
      const key = `pm:payment:${u.tgId}`;
      // Paid/closed state edits an existing message and never sends a fresh payment demand.
      const rendered = personalPayment(this.env, view, bill, line, receiver.tgId);
      await this.deliver(u.tgId, key, rendered, bill.status === 'closed' || line.due === 0);
      await this.deliver(u.tgId, `pm:reminder:${u.tgId}`, rendered, true);
    }
    if (this.error !== null) throw this.error;
  }

  async notice(n: OutNotice, view: EventView): Promise<OutNotice> {
    if (n.kind === 'cancelled') return n;
    if (n.kind === 'moves') {
      if (view.status !== 'collecting' && view.status !== 'scheduled') return { ...n, promoted: [], demoted: [] };
      const route = async (people: PersonView[], promoted: boolean) => {
        const fallback: PersonView[] = [];
        for (const p of people) {
          const id = p.tgId ?? p.guestOf?.tgId;
          if (id === undefined || id === null) { fallback.push(p); continue; }
          const done = await this.deliver(id, `pm:move:${p.signupId}`, personalMovement(this.env, view, p, promoted));
          if (done === false) {
            try { if (await this.tg.isMember(this.chatId, id)) fallback.push(p); }
            catch (e) { this.failure(e); }
          }
        }
        return fallback;
      };
      return { ...n, promoted: await route(n.promoted, true), demoted: await route(n.demoted, false) };
    }
    const progress = (await this.storage.get<Record<string, 'sent' | 'unavailable' | 'skipped' | 'failed'>>('reminderProgress')) ?? {};
    const oldReport = await this.storage.get<DeliveryReport>('deliveryReport');
    const saveReport = async () => {
      const values = Object.values(progress);
      const report: DeliveryReport = {
        at: oldReport?.at ?? Date.now(), sent: values.filter(v => v === 'sent').length,
        unavailable: values.filter(v => v === 'unavailable').length,
        skipped: values.filter(v => v === 'skipped').length,
        failed: values.filter(v => v === 'failed').length,
        status: this.error !== null ? 'retrying' : 'queued',
      };
      await this.storage.put({ deliveryReport: report, reminderProgress: progress });
    };
    const raw = await getBillByEvent(this.db, view.id);
    if (!raw || raw.status === 'closed') { await saveReport(); return { ...n, debtors: [] }; }
    const bill = await billDto(this.db, raw.id);
    const [receiver] = await this.db.select().from(users).where(eq(users.id, raw.receiverUserId));
    const fallback: PersonView[] = [];
    for (const p of n.debtors) {
      if (p.tgId === null) continue;
      const key = `reminder:${p.tgId}`;
      const lastAt = await this.storage.get<number>(key);
      if (lastAt !== undefined && Date.now() - lastAt < REMINDER_GAP_MS) {
        if (!progress[p.tgId] || progress[p.tgId] === 'failed') progress[p.tgId] = 'skipped';
        continue;
      }
      const [u] = await this.db.select().from(users).where(eq(users.tgId, p.tgId));
      const line = bill.lines.find(l => l.userId === u?.id);
      if (!line?.due) { delete progress[p.tgId]; continue; }
      const done = await this.deliver(p.tgId, `pm:reminder:${p.tgId}`, personalPayment(this.env, view, bill, line, receiver.tgId, true), false, true);
      progress[p.tgId] = done === true ? 'sent' : done === false ? 'unavailable' : 'failed';
      if (done === true) await this.storage.put(key, Date.now());
      else if (done === false) {
        // Only actual current group members are mentioned in a fallback reminder.
        try { if (await this.tg.isMember(this.chatId, p.tgId)) fallback.push(p); }
        catch (e) { this.failure(e); }
      }
      await this.storage.put('reminderProgress', progress);
    }
    await saveReport();
    return { ...n, debtors: fallback };
  }

  async groupNoticeSent(n: OutNotice): Promise<void> {
    if (n.kind === 'reminder') {
      for (const p of n.debtors) if (p.tgId !== null) await this.storage.put(`reminder:${p.tgId}`, Date.now());
    }
  }

  async completeNotice(n: OutNotice): Promise<void> {
    if (n.kind !== 'reminder') return;
    const report = await this.storage.get<DeliveryReport>('deliveryReport');
    if (report) await this.storage.put('deliveryReport', { ...report, status: 'complete' });
  }
}
