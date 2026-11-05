import { demotedIds, limitFor, promotedIds, splitQueue, canRestore, matchStartsAt, registrationOpen, type QueueSplit, type Role } from '@altynka/core';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { communities, events, signups, teamAssignments, type EventRow, type SignupRow } from '../db/schema';
import type { Notice, SyncPort } from '../sync/port';

export interface Deps {
  db: Db;
  now: number;
  sync: SyncPort;
}

export type JoinResult =
  | { kind: 'main' | 'reserve'; position: number; restored: boolean }
  | { kind: 'already'; position: number; inMain: boolean }
  | { kind: 'closed' }
  | { kind: 'not_found' };

export const isClosed = (ev: EventRow, now = Date.now()) => !registrationOpen(ev, now);
export const canManage = (role: Role) => role === 'organizer' || role === 'admin';

export async function getEvent(db: Db, eventId: number): Promise<EventRow | null> {
  return (await db.select().from(events).where(eq(events.id, eventId)))[0] ?? null;
}

async function activeSignups(db: Db, eventId: number): Promise<SignupRow[]> {
  return db.select().from(signups).where(and(eq(signups.eventId, eventId), isNull(signups.leftAt)));
}

export async function loadQueue(db: Db, eventId: number): Promise<QueueSplit<SignupRow>> {
  const ev = await getEvent(db, eventId);
  return splitQueue(await activeSignups(db, eventId), ev?.baseLimit ?? limitFor(null));
}

function placeOf(q: QueueSplit<SignupRow>, signupId: number): { inMain: boolean; position: number } {
  const m = q.main.findIndex(s => s.id === signupId);
  if (m >= 0) return { inMain: true, position: m + 1 };
  return { inMain: false, position: q.reserve.findIndex(s => s.id === signupId) + 1 };
}

function movesNotices(before: QueueSplit<SignupRow>, after: QueueSplit<SignupRow>): Notice[] {
  const out: Notice[] = [];
  const up = promotedIds(before, after);
  const down = demotedIds(before, after);
  if (up.length) out.push({ kind: 'promoted', signupIds: up });
  if (down.length) out.push({ kind: 'demoted', signupIds: down });
  return out;
}

async function syncEvent(d: Deps, eventId: number, notices: Notice[]): Promise<void> {
  await d.sync.request(eventId, notices.length ? { parts: ['event'], notices } : { parts: ['event'] });
}

/** Одна атомарная вставка: следующий номер очереди считается внутри того же запроса. */
async function insertSignup(
  db: Db,
  v: { eventId: number; userId: number | null; guestName: string | null; invitedBy: number | null; now: number },
): Promise<number> {
  const rows = await db.all<{ id: number }>(sql`
    INSERT INTO signups (event_id, user_id, guest_name, invited_by, seq, manual, created_at)
    SELECT ${v.eventId}, ${v.userId}, ${v.guestName}, ${v.invitedBy}, COALESCE(MAX(seq), 0) + 1, 0, ${v.now}
    FROM signups WHERE event_id = ${v.eventId}
    RETURNING id`);
  return rows[0].id;
}

/**
 * Гость встаёт в очередь, только если у пригласившего нет активного гостя с тем же именем.
 * Проверка — в том же запросе, поэтому двойное нажатие не запишет двоих.
 */
async function insertGuest(db: Db, v: { eventId: number; invitedBy: number; name: string; now: number }): Promise<number | null> {
  const rows = await db.all<{ id: number }>(sql`
    INSERT INTO signups (event_id, user_id, guest_name, invited_by, seq, manual, created_at)
    SELECT ${v.eventId}, NULL, ${v.name}, ${v.invitedBy}, next, 0, ${v.now}
    FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM signups WHERE event_id = ${v.eventId})
    WHERE NOT EXISTS (
      SELECT 1 FROM signups
      WHERE event_id = ${v.eventId} AND user_id IS NULL AND invited_by = ${v.invitedBy}
        AND guest_name = ${v.name} AND left_at IS NULL)
    RETURNING id`);
  return rows[0]?.id ?? null;
}

/** drizzle оборачивает ошибку D1, поэтому смотрим всю цепочку cause. */
export function isUniqueViolation(e: unknown): boolean {
  for (let cur = e as { message?: string; cause?: unknown } | undefined; cur; cur = cur.cause as typeof cur) {
    if (/UNIQUE constraint failed/i.test(String(cur.message ?? ''))) return true;
  }
  return false;
}

export async function createEvent(
  d: Deps,
  v: { communityId: number; date: string; comment: string | null; createdBy: number },
): Promise<number> {
  const [community] = await d.db.select().from(communities).where(eq(communities.id, v.communityId));
  const [row] = await d.db
    .insert(events)
    .values({ communityId: v.communityId, ratingEnabled: true, telegramChatId: community?.tgChatId, date: v.date, comment: v.comment, createdBy: v.createdBy, createdAt: d.now })
    .returning({ id: events.id });
  await syncEvent(d, row.id, []);
  return row.id;
}

export async function joinEvent(d: Deps, eventId: number, userId: number): Promise<JoinResult> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return { kind: 'not_found' };
  if (isClosed(ev, d.now)) return { kind: 'closed' };
  const [existing] = await d.db
    .select()
    .from(signups)
    .where(and(eq(signups.eventId, eventId), eq(signups.userId, userId)));
  const before = await loadQueue(d.db, eventId);
  if (existing && existing.leftAt === null) {
    return { kind: 'already', ...placeOf(before, existing.id) };
  }
  let signupId: number;
  let restored = false;
  if (existing && canRestore(existing.leftAt, d.now)) {
    await d.db.update(signups).set({ leftAt: null }).where(eq(signups.id, existing.id));
    signupId = existing.id;
    restored = true;
  } else {
    if (existing) await d.db.delete(signups).where(eq(signups.id, existing.id));
    try {
      signupId = await insertSignup(d.db, { eventId, userId, guestName: null, invitedBy: null, now: d.now });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const q = await loadQueue(d.db, eventId);
      const [row] = await d.db
        .select()
        .from(signups)
        .where(and(eq(signups.eventId, eventId), eq(signups.userId, userId)));
      return { kind: 'already', ...placeOf(q, row.id) };
    }
  }
  const after = await loadQueue(d.db, eventId);
  await syncEvent(d, eventId, movesNotices(before, after));
  const p = placeOf(after, signupId);
  return { kind: p.inMain ? 'main' : 'reserve', position: p.position, restored };
}

export async function leaveEvent(
  d: Deps,
  eventId: number,
  userId: number,
): Promise<{ kind: 'left' | 'not_in' | 'closed' | 'not_found' }> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return { kind: 'not_found' };
  if (isClosed(ev, d.now)) return { kind: 'closed' };
  const [existing] = await d.db
    .select()
    .from(signups)
    .where(and(eq(signups.eventId, eventId), eq(signups.userId, userId), isNull(signups.leftAt)));
  if (!existing) return { kind: 'not_in' };
  const before = await loadQueue(d.db, eventId);
  await d.db.batch([
    d.db.update(signups).set({ leftAt: d.now }).where(eq(signups.id, existing.id)),
    d.db.delete(teamAssignments).where(eq(teamAssignments.signupId, existing.id)),
  ]);
  const after = await loadQueue(d.db, eventId);
  await syncEvent(d, eventId, movesNotices(before, after));
  return { kind: 'left' };
}

export async function addGuest(
  d: Deps,
  eventId: number,
  invitedBy: number,
  name: string,
): Promise<
  { kind: 'main' | 'reserve'; position: number; signupId: number } | { kind: 'duplicate' } | { kind: 'closed' } | { kind: 'not_found' }
> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return { kind: 'not_found' };
  if (isClosed(ev, d.now)) return { kind: 'closed' };
  const before = await loadQueue(d.db, eventId);
  const signupId = await insertGuest(d.db, { eventId, invitedBy, name, now: d.now });
  if (signupId === null) return { kind: 'duplicate' };
  const after = await loadQueue(d.db, eventId);
  await syncEvent(d, eventId, movesNotices(before, after));
  const p = placeOf(after, signupId);
  return { kind: p.inMain ? 'main' : 'reserve', position: p.position, signupId };
}

export async function removeSignup(
  d: Deps,
  signupId: number,
  actor: { userId: number; role: Role },
): Promise<'ok' | 'forbidden' | 'not_found' | 'closed'> {
  const [s] = await d.db.select().from(signups).where(eq(signups.id, signupId));
  if (!s || s.leftAt !== null) return 'not_found';
  const ev = await getEvent(d.db, s.eventId);
  if (!ev) return 'not_found';
  if (isClosed(ev, d.now)) return 'closed';
  const allowed = canManage(actor.role) || (s.userId === null && s.invitedBy === actor.userId);
  if (!allowed) return 'forbidden';
  const before = await loadQueue(d.db, s.eventId);
  await d.db.batch([
    d.db.delete(teamAssignments).where(eq(teamAssignments.signupId, s.id)),
    d.db.delete(signups).where(eq(signups.id, s.id)),
  ]);
  const after = await loadQueue(d.db, s.eventId);
  await syncEvent(d, s.eventId, movesNotices(before, after));
  return 'ok';
}

export async function scheduleEvent(
  d: Deps,
  eventId: number,
  v: { startTime: string; durationHours: 1 | 2; place: string | null },
): Promise<'ok' | 'not_found' | 'closed' | 'past_start'> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return 'not_found';
  if (isClosed(ev, d.now)) return 'closed';
  if (ev.status === 'scheduled' && ev.startTime === v.startTime && ev.durationHours === v.durationHours && ev.place === v.place) return 'ok';
  const start = matchStartsAt({ date: ev.date, startTime: v.startTime });
  if (start === null || start <= d.now) return 'past_start';
  const before = await loadQueue(d.db, eventId);
  await d.db
    .update(events)
    .set({
      startTime: v.startTime,
      durationHours: v.durationHours,
      place: v.place,
      baseLimit: limitFor(v.durationHours),
      status: 'scheduled',
    })
    .where(eq(events.id, eventId));
  const after = await loadQueue(d.db, eventId);
  await syncEvent(d, eventId, [{ kind: 'scheduled', ...(ev.status === 'scheduled' ? { previous: { startTime: ev.startTime, durationHours: ev.durationHours, place: ev.place } } : {}) }, ...movesNotices(before, after)]);
  return 'ok';
}

export async function cancelEvent(d: Deps, eventId: number): Promise<'ok' | 'not_found' | 'closed'> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return 'not_found';
  if (isClosed(ev, d.now)) return 'closed';
  const changed = await d.db.update(events).set({ status: 'cancelled' }).where(and(eq(events.id, eventId), sql`not exists (select 1 from match_reviews where event_id = ${eventId})`)).returning({ id: events.id });
  if (!changed.length) return 'closed';
  await syncEvent(d, eventId, [{ kind: 'cancelled' }]);
  return 'ok';
}
