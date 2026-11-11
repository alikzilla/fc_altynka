import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { memberships, users, type UserRow } from '../db/schema';
import { billDto, getBillByEvent } from '../domain/bills';
import { communityByChat } from '../domain/members';
import type { Env } from '../env';
import type { EventView, PersonView, Rendered } from '../render/eventMessage';
import { scheduleChange, type OutNotice } from '../render/notices';
import { matchCard, personalCancelled, personalMovement, personalPayment, personalSchedule, personalTeams, placeIn, signupOpen } from '../render/personal';
import { getEvent } from '../domain/events';
import { loadPublishedTeams } from './teamsPart';
import { TgForbidden, TgMessageGone, TgRateLimited, TgRejected, type TgClient } from '../telegram/client';
import { loadEventView } from './parts';

export const REMINDER_GAP_MS = 24 * 3600_000;
/** Столько получателей объявления обходит один прогон alarm; остальные — в следующем, со своим лимитом подзапросов. */
export const ANNOUNCE_BATCH = 12;
/** Кому писать о записи: сам человек или тот, кто пригласил гостя; без повторов. */
const recipientIds = (people: PersonView[]) => [...new Set(people.map(p => p.tgId ?? p.guestOf?.tgId).filter((id): id is number => typeof id === 'number'))];
interface DeliveryState { messageId: number; fingerprint: string; sentAt: number; }
export interface DeliveryReport { at: number; sent: number; unavailable: number; skipped: number; failed: number; status: 'queued' | 'complete' | 'retrying'; }

/** Per-event recipient state lives alongside the durable alarm queue, never in process memory. */
export class PersonalDelivery {
  error: unknown = null;
  /** Объявление разослано не всем: уведомление нужно вернуть в очередь без ошибки. */
  more = false;
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

  /** Открыта запись: всем подписанным участникам группы, кроме создателя матча; порциями. */
  private async announce(view: EventView): Promise<void> {
    if (!signupOpen(view)) return;
    const community = await communityByChat(this.db, this.chatId);
    const event = await getEvent(this.db, view.id);
    if (!community || !event) return;
    const rows = await this.db.select({ tgId: users.tgId, userId: users.id }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.communityId, community.id), eq(memberships.active, true), eq(users.notificationsEnabled, true), eq(users.pmAvailable, true)))
      .orderBy(asc(users.id));
    const done = new Set((await this.storage.get<number[]>('announce:done')) ?? []);
    let budget = ANNOUNCE_BATCH;
    for (const row of rows) {
      if (row.userId === event.createdBy || done.has(row.tgId)) continue;
      if (budget-- === 0) { this.more = true; break; }
      const result = await this.deliver(row.tgId, `pm:announce:${row.tgId}`, matchCard(this.env, view, placeIn(view, row.tgId), 'Открыта запись'));
      if (this.error instanceof TgRateLimited) break;
      if (result === null) continue;
      done.add(row.tgId);
      await this.storage.put('announce:done', [...done]);
    }
  }

  private async teams(eventId: number): Promise<void> {
    const published = await loadPublishedTeams(this.db, eventId);
    if (!published) return;
    for (const tgId of recipientIds(published.teams.flatMap(t => t.players))) {
      await this.deliver(tgId, `pm:teams:${tgId}`, personalTeams(this.env, published.view, published.teams, tgId));
    }
  }

  async notice(n: OutNotice, view: EventView): Promise<OutNotice> {
    if (n.kind === 'cancelled') {
      if (view.status === 'cancelled') for (const tgId of recipientIds([...view.main, ...view.reserve])) {
        await this.deliver(tgId, `pm:cancelled:${tgId}`, personalCancelled(this.env, view));
      }
      return n;
    }
    if (n.kind === 'announced') { await this.announce(view); return n; }
    if (n.kind === 'teams') { await this.teams(view.id); return n; }
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
      const out = { ...n, promoted: await route(n.promoted, true), demoted: await route(n.demoted, false) };
      const change = n.scheduled ? scheduleChange(view, n.previous) : null;
      if (change) {
        // Переход между основой и резервом уже рассказал о времени и поле.
        const moved = new Set(recipientIds([...n.promoted, ...n.demoted]));
        for (const tgId of recipientIds([...view.main, ...view.reserve])) {
          if (!moved.has(tgId)) await this.deliver(tgId, `pm:schedule:${tgId}`, personalSchedule(this.env, view, change, placeIn(view, tgId)));
        }
      }
      return out;
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
