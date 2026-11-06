import { matchPhase } from '@altynka/core';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { bills, events, memberships, users, type SignupRow, type UserRow } from '../db/schema';
import { getCommunity } from '../domain/members';
import { getEvent, loadQueue } from '../domain/events';
import type { Env } from '../env';
import { renderEventMessage, type EventView, type PersonView, type Rendered } from '../render/eventMessage';
import type { OutNotice } from '../render/notices';
import type { MergedNotice } from './plan';
import type { Part } from './port';
import { renderTeamsPart } from './teamsPart';
import { renderBillPart, resolveReminder } from './billPart';

export async function usersById(db: Db, ids: number[]): Promise<Map<number, UserRow>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  const rows = await db.select().from(users).where(inArray(users.id, uniq));
  return new Map(rows.map(u => [u.id, u]));
}

export function personView(s: SignupRow, byId: Map<number, UserRow>): PersonView {
  if (s.userId !== null) {
    const u = byId.get(s.userId);
    return { signupId: s.id, name: u?.displayName ?? '?', tgId: u?.tgId ?? null, guestOf: null };
  }
  const inviter = s.invitedBy !== null ? byId.get(s.invitedBy) : undefined;
  return {
    signupId: s.id,
    name: s.guestName ?? 'Гость',
    tgId: null,
    guestOf: inviter ? { name: inviter.displayName, tgId: inviter.tgId } : null,
  };
}

export async function loadEventView(db: Db, eventId: number): Promise<EventView | null> {
  const ev = await getEvent(db, eventId);
  if (!ev) return null;
  const q = await loadQueue(db, eventId);
  const all = [...q.main, ...q.reserve];
  const byId = await usersById(db, all.flatMap(s => [s.userId, s.invitedBy]).filter((x): x is number => x !== null));
  return {
    id: ev.id,
    communityTitle: (await getCommunity(db, ev.communityId))?.title,
    date: ev.date,
    status: matchPhase(ev),
    startTime: ev.startTime,
    durationHours: ev.durationHours,
    place: ev.place,
    comment: ev.comment,
    limit: q.limit,
    main: q.main.map(s => personView(s, byId)),
    reserve: q.reserve.map(s => personView(s, byId)),
  };
}

type PartRenderer = (db: Db, env: Env, eventId: number) => Promise<Rendered | null>;

const renderers: Record<Part, PartRenderer> = {
  event: async (db, env, eventId) => {
    const v = await loadEventView(db, eventId);
    return v ? renderEventMessage(v, env) : null;
  },
  teams: (db, env, eventId) => renderTeamsPart(db, eventId, env),
  bill: (db, env, eventId) => renderBillPart(db, eventId, env),
};

/** Tasks 10–11 подключают составы и счёт. */
export function registerPartRenderer(part: Part, r: PartRenderer): void {
  renderers[part] = r;
}

export function renderPart(db: Db, env: Env, eventId: number, part: Part): Promise<Rendered | null> {
  return renderers[part](db, env, eventId);
}

export async function getMessageId(db: Db, eventId: number, part: Part): Promise<number | null> {
  if (part === 'bill') return (await db.select().from(bills).where(eq(bills.eventId, eventId)))[0]?.messageId ?? null;
  const ev = await getEvent(db, eventId);
  return (part === 'event' ? ev?.eventMessageId : ev?.teamsMessageId) ?? null;
}

export async function setMessageId(db: Db, eventId: number, part: Part, id: number | null): Promise<void> {
  if (part === 'bill') await db.update(bills).set({ messageId: id }).where(eq(bills.eventId, eventId));
  else if (part === 'event') await db.update(events).set({ eventMessageId: id }).where(eq(events.id, eventId));
  else await db.update(events).set({ teamsMessageId: id }).where(eq(events.id, eventId));
}

type ReminderResolver = (db: Db, billId: number) => Promise<OutNotice>;
let reminderResolver: ReminderResolver = (db, billId) => resolveReminder(db, billId);

/** Task 11 подключает должников. */
export function registerReminderResolver(r: ReminderResolver): void {
  reminderResolver = r;
}

export async function resolveNotice(db: Db, view: EventView, n: MergedNotice): Promise<OutNotice> {
  if (n.kind === 'cancelled') return n;
  if (n.kind === 'reminder') return reminderResolver(db, n.billId);
  const all = [...view.main, ...view.reserve];
  const pick = (ids: number[]) => ids.map(id => all.find(p => p.signupId === id)).filter((p): p is PersonView => !!p);
  return { kind: 'moves', promoted: pick(n.promoted), demoted: pick(n.demoted), scheduled: n.scheduled && view.status === 'scheduled', ...(n.previous ? { previous: n.previous } : {}) };
}
