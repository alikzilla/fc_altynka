import type { TeamCount, TeamsDto } from '@altynka/core';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, signups, teamAssignments } from '../db/schema';
import { getEvent, isClosed, loadQueue, type Deps } from './events';

const rosterKey = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',');

export async function saveTeams(
  d: Deps,
  eventId: number,
  v: { teamCount: TeamCount; teams: number[][]; guestLevels: Record<number, number> },
): Promise<'ok' | 'invalid' | 'not_found' | 'closed'> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return 'not_found';
  if (isClosed(ev)) return 'closed';
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
  const rows = v.teams.flatMap((ids, teamIndex) => ids.map(signupId => ({ signupId, eventId, teamIndex })));
  await d.db.batch([
    d.db.delete(teamAssignments).where(eq(teamAssignments.eventId, eventId)),
    ...(rows.length ? [d.db.insert(teamAssignments).values(rows)] : []),
    d.db.update(events).set({ teamCount: v.teamCount, teamsRoster: rosterKey(flat) }).where(eq(events.id, eventId)),
    ...Object.entries(v.guestLevels).map(([id, lvl]) =>
      d.db.update(signups).set({ guestLevel: lvl }).where(eq(signups.id, Number(id))),
    ),
  ]);
  return 'ok';
}

export async function publishTeams(d: Deps, eventId: number): Promise<'ok' | 'no_teams' | 'not_found'> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return 'not_found';
  const rows = await d.db.select().from(teamAssignments).where(eq(teamAssignments.eventId, eventId)).limit(1);
  if (!ev.teamCount || !rows.length) return 'no_teams';
  await d.db.update(events).set({ teamsPublishedAt: d.now }).where(eq(events.id, eventId));
  await d.sync.request(eventId, { parts: ['teams'] });
  return 'ok';
}

/** Команды по порядку TEAMS, внутри — по порядку записи; stale — состав основы изменился. */
export async function teamsDto(db: Db, eventId: number, mainIds: number[]): Promise<TeamsDto | null> {
  const ev = await getEvent(db, eventId);
  if (!ev?.teamCount) return null;
  const rows = await db
    .select({ signupId: teamAssignments.signupId, teamIndex: teamAssignments.teamIndex })
    .from(teamAssignments)
    .innerJoin(signups, eq(signups.id, teamAssignments.signupId))
    .where(eq(teamAssignments.eventId, eventId))
    .orderBy(asc(signups.seq));
  const teams: number[][] = Array.from({ length: ev.teamCount }, () => []);
  rows.forEach(r => teams[r.teamIndex]?.push(r.signupId));
  const stale = rosterKey(mainIds) !== ev.teamsRoster;
  return { teamCount: ev.teamCount, teams, publishedAt: ev.teamsPublishedAt, stale };
}
