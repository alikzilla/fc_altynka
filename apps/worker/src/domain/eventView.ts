import { matchPhase, splitQueue, type CommunityDto, type EventDetailDto, type EventsListDto, type EventSummaryDto, type MatchArchiveDto, type QueueSplit, type Role, type SignupDto } from '@altynka/core';
import { and, asc, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, signups, type EventRow, type SignupRow } from '../db/schema';
import { usersById } from '../sync/parts';
import { getEvent, loadQueue } from './events';
import { teamsDto } from './teams';
import { matchReview, playerRatings } from './ratings';
import { billDto, getBillByEvent } from './bills';

const ACTIVE: EventRow['status'][] = ['collecting', 'scheduled', 'billing'];
const PAST: EventRow['status'][] = ['closed', 'cancelled'];

function summary(ev: EventRow, q: QueueSplit<SignupRow>, viewerUserId: number, now: number, community: CommunityDto): EventSummaryDto {
  const my = q.main.some(s => s.userId === viewerUserId) ? 'main' : q.reserve.some(s => s.userId === viewerUserId) ? 'reserve' : null;
  return {
    id: ev.id,
    date: ev.date,
    status: matchPhase(ev, now),
    serverNow: now,
    startTime: ev.startTime,
    durationHours: ev.durationHours,
    place: ev.place,
    limit: q.limit,
    mainCount: q.main.length,
    reserveCount: q.reserve.length,
    my,
    community: { id: community.id, title: community.title },
  };
}

const groupsById = (groups: CommunityDto[]) => new Map(groups.map(g => [g.id, g]));

/** Feed of all the viewer's groups, each match labelled with its group. */
export async function listEvents(db: Db, groups: CommunityDto[], viewerUserId: number, now = Date.now()): Promise<EventsListDto> {
  if (!groups.length) return { active: [], past: [] };
  const byId = groupsById(groups);
  const ids = [...byId.keys()];
  const active = await db
    .select()
    .from(events)
    .where(and(inArray(events.communityId, ids), inArray(events.status, ACTIVE)))
    .orderBy(asc(events.date), asc(events.id));
  const past = await db
    .select()
    .from(events)
    .where(and(inArray(events.communityId, ids), inArray(events.status, PAST)))
    .orderBy(desc(events.date), desc(events.id))
    .limit(5);
  const sum = async (ev: EventRow) => summary(ev, await loadQueue(db, ev.id), viewerUserId, now, byId.get(ev.communityId)!);
  return { active: await Promise.all(active.map(sum)), past: await Promise.all(past.map(sum)) };
}

export interface ArchiveCursor { date: string; id: number }

/** Cursor is a complete descending (date, id) key, including same-day ties. */
export function parseArchiveCursor(raw: string): ArchiveCursor | null {
  const match = /^(\d{4}-\d{2}-\d{2}):([1-9]\d*)$/.exec(raw);
  if (!match) return null;
  const [, date, idText] = match;
  const id = Number(idText);
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isSafeInteger(id) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return null;
  return { date, id };
}

/** One archive across all the viewer's groups, paginated by (date desc, id desc). */
export async function matchArchive(db: Db, groups: CommunityDto[], viewerUserId: number, cursor: ArchiveCursor | null, now = Date.now()): Promise<MatchArchiveDto> {
  if (!groups.length) return { events: [], nextCursor: null };
  const byId = groupsById(groups);
  const rows = await db.select().from(events).where(and(
    inArray(events.communityId, [...byId.keys()]),
    inArray(events.status, ['billing', 'closed', 'cancelled']),
    cursor ? or(lt(events.date, cursor.date), and(eq(events.date, cursor.date), lt(events.id, cursor.id))) : undefined,
  )).orderBy(desc(events.date), desc(events.id)).limit(21);
  const page = rows.slice(0, 20);
  // All queue entries for the page are loaded together; no detail request/query per match.
  const entries = page.length ? await db.select().from(signups).where(and(inArray(signups.eventId, page.map(e => e.id)), isNull(signups.leftAt))) : [];
  const queues = new Map<number, SignupRow[]>();
  for (const entry of entries) {
    const queue = queues.get(entry.eventId) ?? [];
    queue.push(entry);
    queues.set(entry.eventId, queue);
  }
  const last = page.at(-1);
  return {
    events: page.map(ev => summary(ev, splitQueue(queues.get(ev.id) ?? [], ev.baseLimit), viewerUserId, now, byId.get(ev.communityId)!)),
    nextCursor: rows.length > 20 && last ? `${last.date}:${last.id}` : null,
  };
}

/** Деталь сбора; уровни — только для организатора и админа. Составы и счёт добавляют Tasks 10–11. */
export async function eventDetail(
  db: Db,
  eventId: number,
  viewer: { userId: number; role: Role; community: CommunityDto },
  now = Date.now(),
): Promise<EventDetailDto | null> {
  const ev = await getEvent(db, eventId);
  if (!ev || ev.communityId !== viewer.community.id) return null;
  const q = await loadQueue(db, eventId);
  const all = [...q.main, ...q.reserve];
  const byId = await usersById(db, all.flatMap(s => [s.userId, s.invitedBy]).filter((x): x is number => x !== null));
  const showLevels = viewer.role !== 'player';
  const levels = new Map<number, number>();
  if (showLevels) {
    const ratings = await playerRatings(db, all.flatMap(s => s.userId === null ? [] : [s.userId]), now);
    ratings.forEach(p => levels.set(p.userId, p.rating.value));
  }
  const dto = (s: SignupRow): SignupDto => {
    const base: SignupDto = {
      id: s.id,
      seq: s.seq,
      name: s.userId !== null ? (byId.get(s.userId)?.displayName ?? '?') : (s.guestName ?? 'Гость'),
      userId: s.userId,
      guestOfName: s.userId === null && s.invitedBy !== null ? (byId.get(s.invitedBy)?.displayName ?? null) : null,
      invitedByUserId: s.userId === null ? s.invitedBy : null,
    };
    if (showLevels) base.level = s.userId !== null ? (levels.get(s.userId) ?? 5) : (s.guestLevel ?? 5);
    if (showLevels && s.userId !== null) base.kaspiPhone = byId.get(s.userId)?.kaspiPhone ?? null;
    return base;
  };
  const { state, canFinish, completedAt, closesAt, gameScore } = await matchReview(db, ev, viewer.userId, showLevels, now);
  return {
    review: { state, canFinish, completedAt, closesAt, gameScore },
    ...summary(ev, q, viewer.userId, now, viewer.community),
    viewerRole: viewer.role,
    comment: ev.comment,
    main: q.main.map(dto),
    reserve: q.reserve.map(dto),
    teams: await teamsDto(db, eventId, q.main.map(s => s.id)),
    bill: await (async () => {
      const b = await getBillByEvent(db, eventId);
      return b ? billDto(db, b.id) : null;
    })(),
  };
}
