import { calculateScorers, calculateStandings, chooseFirstPair, chooseKickoff, todayAlmaty, type GameMutationMeta, type GameProtocolDto, type GameState, type TeamsDto } from '@altynka/core';
import { inArray } from 'drizzle-orm';
import { users, type EventRow } from '../db/schema';
import { getEvent, loadQueue, type Deps } from './events';
import { commitGameCommand, parseGameState, previousGameCommand, type GameCommitResult } from './gameStore';
import { teamsDto, teamsDtoFromEvent } from './teams';

export type GameCommandResult = { kind: 'ok'; protocol: GameProtocolDto; appliedRevision: number }
  | { kind: 'invalid' | 'stale' | 'not_started' | 'completed' | 'closed' | 'conflict' | 'not_found'; reason?: string };

export async function getGameProtocol(d: Deps, eventId: number, manage: boolean): Promise<GameProtocolDto | null> {
  const ev = await getEvent(d.db, eventId);
  return ev ? gameProtocolFromEvent(d, ev, manage) : null;
}

/** Loaded preparation belongs to this response; nothing is cached across requests. */
export async function gameProtocolFromEvent(
  d: Deps, ev: EventRow, manage: boolean, preparation?: { teams: TeamsDto | null; mainCount: number },
): Promise<GameProtocolDto> {
  const state = parseGameState(ev);
  const legacy = ev.protocolVersion !== 1;
  const active = !legacy && ev.startedAt !== null && ev.completedAt === null && ev.status !== 'cancelled';
  const editable = !legacy && ev.startedAt !== null && ev.status !== 'cancelled';
  let canStart = false;
  if (!legacy && ev.startedAt === null && ev.status === 'scheduled' && ev.date <= todayAlmaty(new Date(d.now))) {
    let teams = preparation?.teams;
    let mainCount = preparation?.mainCount;
    if (!preparation) {
      const q = await loadQueue(d.db, ev.id, ev.baseLimit);
      teams = await teamsDtoFromEvent(d.db, ev, q.main.map(p => p.id));
      mainCount = q.main.length;
    }
    canStart = !!teams?.publishedAt && !teams.stale && teams.teams.every(t => t.length > 0) && teams.teams.flat().length === mainCount;
  }
  const currentPair = active ? state?.currentPair ?? null : null;
  return {
    state: legacy ? 'legacy' : ev.completedAt !== null ? 'completed' : ev.startedAt !== null ? 'playing' : 'not_started',
    revision: ev.gameRevision, startedAt: ev.startedAt, completedAt: ev.completedAt,
    teamCount: state?.teamCount ?? null, roster: state?.roster ?? [], currentPair,
    restingTeamIndex: currentPair && state?.teamCount === 3 ? [0, 1, 2].find(t => !currentPair.includes(t)) ?? null : null,
    kickoffTeamIndex: state?.teamCount === 2 ? state.kickoffTeamIndex ?? null : null,
    games: state?.games ?? [], standings: state ? calculateStandings(state.teamCount, state.games) : [],
    scorers: state ? calculateScorers(state.roster, state.games) : [],
    canStart: manage && canStart, canRecord: manage && active, canEdit: manage && editable,
    canUndo: manage && active && !!state?.games.length, canFinish: manage && active,
  };
}

export async function gameCommandResponse(d: Deps, eventId: number, result: GameCommitResult): Promise<GameCommandResult> {
  if (result.kind !== 'ok') return result;
  const protocol = await getGameProtocol(d, eventId, true);
  return protocol ? { kind: 'ok', protocol, appliedRevision: result.appliedRevision } : { kind: 'not_found' };
}

export async function startGameSession(d: Deps, eventId: number, actorId: number, meta: GameMutationMeta): Promise<GameCommandResult> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return { kind: 'not_found' };
  const duplicate = previousGameCommand(ev, meta, 'start');
  if (duplicate) {
    if (duplicate.kind === 'ok') await d.sync.request(eventId, { parts: ['event', 'teams'] });
    return gameCommandResponse(d, eventId, duplicate);
  }
  if (ev.protocolVersion !== 1 || ev.status === 'cancelled') return { kind: 'closed' };
  if (ev.startedAt !== null) {
    await d.sync.request(eventId, { parts: ['event', 'teams'] });
    return gameCommandResponse(d, eventId, { kind: 'ok', duplicate: true, appliedRevision: 1 });
  }
  if (ev.status !== 'scheduled' || ev.date > todayAlmaty(new Date(d.now))) return { kind: 'closed' };
  if (meta.expectedRevision !== ev.gameRevision) return { kind: 'conflict' };
  const q = await loadQueue(d.db, eventId);
  const teams = await teamsDto(d.db, eventId, q.main.map(p => p.id));
  if (!teams?.publishedAt || teams.stale || teams.teams.some(t => !t.length)) return { kind: 'stale' };
  const ids = teams.teams.flat();
  if (ids.length !== q.main.length || new Set(ids).size !== ids.length || !q.main.every(p => ids.includes(p.id))) return { kind: 'stale' };
  const userIds = q.main.flatMap(p => p.userId === null ? [] : [p.userId]);
  const names = userIds.length ? await d.db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, userIds)) : [];
  const nameById = new Map(names.map(p => [p.id, p.name]));
  const roster = q.main.map(p => ({ signupId: p.id, userId: p.userId, name: p.userId === null ? p.guestName ?? 'Гость' : nameById.get(p.userId) ?? 'Игрок', teamIndex: teams.teams.findIndex(t => t.includes(p.id)) }));
  const pair = chooseFirstPair(teams.teamCount);
  const state: GameState = { teamCount: teams.teamCount, roster, initialPair: pair, currentPair: pair, games: [], receipts: [], finishParticipants: null, ...(teams.teamCount === 2 ? { kickoffTeamIndex: chooseKickoff() } : {}) };
  const committed = await commitGameCommand(d, ev, meta, { fingerprint: 'start', state, startedAt: d.now, completedAt: null });
  if (committed.kind === 'conflict') {
    const latest = await getEvent(d.db, eventId);
    if (latest?.startedAt !== null && latest?.startedAt !== undefined) return gameCommandResponse(d,eventId,{kind:'ok',duplicate:true,appliedRevision:1});
    return { kind: 'stale' };
  }
  if (committed.kind === 'ok') await d.sync.request(eventId, { parts: ['event', 'teams'] });
  return gameCommandResponse(d, eventId, committed);
}
