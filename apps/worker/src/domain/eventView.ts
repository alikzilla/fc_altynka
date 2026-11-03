import type { EventDetailDto, EventsListDto, EventSummaryDto, QueueSplit, Role, SignupDto } from '@altynka/core';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, memberships, type EventRow, type SignupRow } from '../db/schema';
import { usersById } from '../sync/parts';
import { getEvent, loadQueue } from './events';
import { teamsDto } from './teams';
import { billDto, getBillByEvent } from './bills';

const ACTIVE: EventRow['status'][] = ['collecting', 'scheduled', 'billing'];
const PAST: EventRow['status'][] = ['closed', 'cancelled'];

function summary(ev: EventRow, q: QueueSplit<SignupRow>, viewerUserId: number): EventSummaryDto {
  const my = q.main.some(s => s.userId === viewerUserId) ? 'main' : q.reserve.some(s => s.userId === viewerUserId) ? 'reserve' : null;
  return {
    id: ev.id,
    date: ev.date,
    status: ev.status,
    startTime: ev.startTime,
    durationHours: ev.durationHours,
    place: ev.place,
    limit: q.limit,
    mainCount: q.main.length,
    reserveCount: q.reserve.length,
    my,
  };
}

export async function listEvents(db: Db, communityId: number, viewerUserId: number): Promise<EventsListDto> {
  const active = await db
    .select()
    .from(events)
    .where(and(eq(events.communityId, communityId), inArray(events.status, ACTIVE)))
    .orderBy(asc(events.date), asc(events.id));
  const past = await db
    .select()
    .from(events)
    .where(and(eq(events.communityId, communityId), inArray(events.status, PAST)))
    .orderBy(desc(events.date), desc(events.id))
    .limit(5);
  const sum = async (ev: EventRow) => summary(ev, await loadQueue(db, ev.id), viewerUserId);
  return { active: await Promise.all(active.map(sum)), past: await Promise.all(past.map(sum)) };
}

/** Деталь сбора; уровни — только для организатора и админа. Составы и счёт добавляют Tasks 10–11. */
export async function eventDetail(
  db: Db,
  eventId: number,
  viewer: { userId: number; role: Role; communityId: number },
): Promise<EventDetailDto | null> {
  const ev = await getEvent(db, eventId);
  if (!ev || ev.communityId !== viewer.communityId) return null;
  const q = await loadQueue(db, eventId);
  const all = [...q.main, ...q.reserve];
  const byId = await usersById(db, all.flatMap(s => [s.userId, s.invitedBy]).filter((x): x is number => x !== null));
  const showLevels = viewer.role !== 'player';
  const levels = new Map<number, number>();
  if (showLevels) {
    const ms = await db.select().from(memberships).where(eq(memberships.communityId, ev.communityId));
    ms.forEach(m => levels.set(m.userId, m.level));
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
    return base;
  };
  return {
    ...summary(ev, q, viewer.userId),
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
