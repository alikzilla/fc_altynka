import { guardRosterMutation } from './rosterGuard';
import { TEAM_COLORS, teamColorsFor, type TeamColor, type TeamCount, type TeamsDto } from '@altynka/core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, signups, teamAssignments, type EventRow } from '../db/schema';
import { playerRatings } from './ratings';
import { getEvent, isClosed, loadQueue, type Deps } from './events';

const rosterKey = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',');

async function saveTeamsUnsafe(
  d: Deps,
  eventId: number,
  v: { teamCount: TeamCount; teams: number[][]; guestLevels: Record<number, number>; refreshRatings?: boolean; ratingSnapshot?: Record<number, number> },
): Promise<'ok' | 'invalid' | 'not_found' | 'closed' | 'stale'> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return 'not_found';
  if (isClosed(ev, d.now)) return 'closed';
  const q = await loadQueue(d.db, eventId);
  const main = new Map(q.main.map(s => [s.id, s]));
  const flat = v.teams.flat();
  const valid =
    v.teams.length === v.teamCount &&
    flat.length === main.size &&
    new Set(flat).size === flat.length &&
    flat.every(id => main.has(id)) &&
    Object.entries(v.guestLevels).every(([id, lvl]) => {
      const s = main.get(Number(id));
      return s !== undefined && s.userId === null && Number.isInteger(lvl) && lvl >= 1 && lvl <= 10;
    });
  if (!valid) return 'invalid';
  const ratings = await playerRatings(d.db, [...main.values()].flatMap(s => s.userId === null ? [] : [s.userId]), d.now);
  const savedSnapshot: Record<number, number> | null = v.refreshRatings === false && ev.teamsRoster === rosterKey(flat) && ev.ratingSnapshot
    ? JSON.parse(ev.ratingSnapshot) as Record<number, number> : null;
  const ratingSnapshot = Object.fromEntries([...main.values()].map(s => [s.id, s.userId === null
    ? (v.guestLevels[s.id] ?? s.guestLevel ?? 5)
    : (savedSnapshot?.[s.id] ?? ratings.get(s.userId)?.rating.value ?? 5)]));
  // Never silently publish a balance different from the numbers reviewed by the organizer.
  if (v.ratingSnapshot && (Object.keys(v.ratingSnapshot).length !== main.size || flat.some(id => v.ratingSnapshot![id] !== ratingSnapshot[id]))) return 'stale';
  const rows = v.teams.flatMap((ids, teamIndex) => ids.map(signupId => ({ signupId, eventId, teamIndex })));
  await d.db.batch([
    d.db.delete(teamAssignments).where(eq(teamAssignments.eventId, eventId)),
    ...(rows.length ? [d.db.insert(teamAssignments).values(rows)] : []),
    d.db.update(events).set({ teamCount: v.teamCount, teamsRoster: rosterKey(flat), ratingSnapshot: JSON.stringify(ratingSnapshot), ...(ev.protocolVersion === 1 ? { teamsPublishedAt: null } : {}) }).where(eq(events.id, eventId)),
    ...Object.entries(v.guestLevels).map(([id, lvl]) =>
      d.db.update(signups).set({ guestLevel: lvl }).where(eq(signups.id, Number(id))),
    ),
  ]);
  return 'ok';
}

async function publishTeamsUnsafe(d: Deps, eventId: number): Promise<'ok' | 'no_teams' | 'not_found' | 'closed' | 'stale'> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return 'not_found';
  if (isClosed(ev, d.now)) return 'closed';
  const queue = await loadQueue(d.db, eventId);
  if (ev.teamCount && rosterKey(queue.main.map(s => s.id)) !== ev.teamsRoster) return 'stale';
  const rows = await d.db.select().from(teamAssignments).where(eq(teamAssignments.eventId, eventId)).limit(1);
  if (!ev.teamCount || !rows.length) return 'no_teams';
  const published = await d.db.update(events).set({ teamsPublishedAt: d.now }).where(and(eq(events.id, eventId), eq(events.rosterRevision, ev.rosterRevision))).returning({ id: events.id });
  if (!published.length) return 'stale';
  await d.sync.request(eventId, { parts: ['teams'] });
  return 'ok';
}

/** Команды по порядку TEAMS, внутри — по порядку записи; stale — состав основы изменился. */
export async function teamsDto(db: Db, eventId: number, mainIds: number[]): Promise<TeamsDto | null> {
  const ev = await getEvent(db, eventId);
  return ev ? teamsDtoFromEvent(db, ev, mainIds) : null;
}

/** Reuse the event snapshot when composing a detail response. */
export async function teamsDtoFromEvent(db: Db, ev: EventRow, mainIds: number[]): Promise<TeamsDto | null> {
  if (!ev.teamCount) return null;
  const rows = await db
    .select({ signupId: teamAssignments.signupId, teamIndex: teamAssignments.teamIndex })
    .from(teamAssignments)
    .innerJoin(signups, eq(signups.id, teamAssignments.signupId))
    .where(eq(teamAssignments.eventId, ev.id))
    .orderBy(asc(signups.seq));
  const teams: number[][] = Array.from({ length: ev.teamCount }, () => []);
  rows.forEach(r => teams[r.teamIndex]?.push(r.signupId));
  const stale = rosterKey(mainIds) !== ev.teamsRoster;
  return { colors: teamColorsFor(ev.teamCount, ev.teamColors ? JSON.parse(ev.teamColors) : undefined), colorsRevision: ev.teamColorsRevision, ratingSnapshot: ev.ratingSnapshot ? JSON.parse(ev.ratingSnapshot) as Record<number, number> : undefined, teamCount: ev.teamCount, teams, publishedAt: ev.teamsPublishedAt, stale };
}

/** Uniform labels are mutable after kickoff; numeric team identity never changes. */
export async function updateTeamColors(
  d: Deps, eventId: number, v: { colors: TeamColor[]; expectedRevision: number },
): Promise<'ok' | 'invalid' | 'not_found' | 'closed' | 'stale'> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return 'not_found';
  if (ev.completedAt !== null || !['collecting', 'scheduled'].includes(ev.status) || ev.startedAt === null && isClosed(ev, d.now)) return 'closed';
  if (!ev.teamCount || v.colors.length !== ev.teamCount || new Set(v.colors).size !== v.colors.length || v.colors.some(key => !TEAM_COLORS.some(c => c.key === key))) return 'invalid';
  if (ev.teamColorsRevision !== v.expectedRevision) return 'stale';
  const updated = await d.db.update(events).set({ teamColors: JSON.stringify(v.colors), teamColorsRevision: v.expectedRevision + 1 })
    .where(and(eq(events.id, eventId), eq(events.teamColorsRevision, v.expectedRevision), eq(events.teamCount, ev.teamCount), eq(events.status, ev.status), isNull(events.completedAt)))
    .returning({ id: events.id });
  if (!updated.length) return 'stale';
  if (ev.teamsPublishedAt !== null) await d.sync.request(eventId, { parts: ['teams'] });
  return 'ok';
}

export const saveTeams = (...args: Parameters<typeof saveTeamsUnsafe>): ReturnType<typeof saveTeamsUnsafe> => guardRosterMutation(() => saveTeamsUnsafe(...args), 'closed' as Awaited<ReturnType<typeof saveTeamsUnsafe>>);
export const publishTeams = (...args: Parameters<typeof publishTeamsUnsafe>): ReturnType<typeof publishTeamsUnsafe> => guardRosterMutation(() => publishTeamsUnsafe(...args), 'closed' as Awaited<ReturnType<typeof publishTeamsUnsafe>>);
