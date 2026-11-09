import { nextGamePair, resolveFirstRest, type GameAssist, type GameMutationMeta, type GameResultInput, type GamePair, type GameState } from '@altynka/core';
import { getEvent, type Deps } from './events';
import { commitGameCommand, parseGameState, previousGameCommand } from './gameStore';
import { gameCommandResponse, type GameCommandResult } from './gameStart';
import { getBillByEvent } from './bills';
import { recoverGameReview } from './gameRecovery';

const sortAssists = (assists: readonly GameAssist[] = []): GameAssist[] => [...assists].sort((a, b) => a.scorerSignupId - b.scorerSignupId || a.assistSignupId - b.assistSignupId);

function resultFingerprint(action: string, input?: GameResultInput, gameId?: string): string {
  return JSON.stringify({ action, gameId: gameId ?? null, ...(input ? { score: input.score, scorers: [...input.scorers].sort((a, b) => a.signupId - b.signupId), assists: sortAssists(input.assists), firstRestTeamIndex: input.firstRestTeamIndex ?? null } : {}) });
}

function validResult(state: GameState, pair: GamePair, input: GameResultInput): boolean {
  if (input.score.length !== 2 || !input.score.every(n => Number.isSafeInteger(n) && n >= 0)) return false;
  if (new Set(input.scorers.map(p => p.signupId)).size !== input.scorers.length) return false;
  const totals = [0, 0];
  for (const goal of input.scorers) {
    if (!Number.isSafeInteger(goal.goals) || goal.goals <= 0) return false;
    const player = state.roster.find(p => p.signupId === goal.signupId);
    const side = player ? pair.indexOf(player.teamIndex) : -1;
    if (side < 0) return false;
    totals[side] += goal.goals;
    if (!Number.isSafeInteger(totals[side]) || totals[side] > input.score[side]) return false;
  }
  return validAssists(state, input);
}

/** An assist belongs to an attributed goal: a different player of the scorer's team, never more than the scorer's goals. */
function validAssists(state: GameState, input: GameResultInput): boolean {
  const assisted = new Map<number, number>();
  const pairs = new Set<string>();
  for (const a of input.assists ?? []) {
    if (!Number.isSafeInteger(a.goals) || a.goals <= 0 || a.scorerSignupId === a.assistSignupId) return false;
    const key = `${a.scorerSignupId}:${a.assistSignupId}`;
    if (pairs.has(key)) return false;
    pairs.add(key);
    const scored = input.scorers.find(s => s.signupId === a.scorerSignupId)?.goals ?? 0;
    const scorer = state.roster.find(p => p.signupId === a.scorerSignupId);
    const passer = state.roster.find(p => p.signupId === a.assistSignupId);
    if (!scorer || !passer || scorer.teamIndex !== passer.teamIndex) return false;
    const total = (assisted.get(a.scorerSignupId) ?? 0) + a.goals;
    if (total > scored) return false;
    assisted.set(a.scorerSignupId, total);
  }
  return true;
}

type Action = { kind: 'record'; input: GameResultInput } | { kind: 'edit'; gameId: string; input: GameResultInput } | { kind: 'undo' };

async function mutateGames(d: Deps, eventId: number, actorId: number, meta: GameMutationMeta, action: Action): Promise<GameCommandResult> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return { kind: 'not_found' };
  const fingerprint = resultFingerprint(action.kind, action.kind === 'undo' ? undefined : action.input, action.kind === 'edit' ? action.gameId : undefined);
  const previous = previousGameCommand(ev, meta, fingerprint);
  if (previous) {
    if (previous.kind === 'ok') await d.sync.request(eventId, { parts: ['event'] });
    return gameCommandResponse(d, eventId, previous);
  }
  if (ev.protocolVersion !== 1 || ev.status === 'cancelled') return { kind: 'closed' };
  const state = parseGameState(ev);
  if (!state || ev.startedAt === null) return { kind: 'not_started' };
  if (ev.completedAt !== null && action.kind !== 'edit') return { kind: 'completed' };
  if (meta.expectedRevision !== ev.gameRevision) return { kind: 'conflict' };
  const games = [...state.games];
  let currentPair = state.currentPair;
  if (action.kind === 'undo') {
    const removed = games.pop();
    if (!removed) return { kind: 'invalid' };
    currentPair = removed.pair;
  } else {
    const index = action.kind === 'record' ? games.length : games.findIndex(g => g.id === action.gameId);
    if (index < 0) return { kind: 'not_found' };
    const pair = action.kind === 'record' ? currentPair : games[index].pair;
    if (!validResult(state, pair, action.input)) return { kind: 'invalid' };
    let firstRestTeamIndex: number | null = null;
    if (state.teamCount === 3 && index === 0) {
      if (action.kind === 'edit' && games.length > 1) {
        firstRestTeamIndex = games[0].firstRestTeamIndex;
        if (action.input.firstRestTeamIndex !== undefined && action.input.firstRestTeamIndex !== firstRestTeamIndex) return { kind: 'invalid', reason: 'rotation_locked' };
      } else {
        try { firstRestTeamIndex = resolveFirstRest(pair, action.input.score, action.input.firstRestTeamIndex); }
        catch { return { kind: 'invalid', reason: 'first_rest_required' }; }
      }
    } else if (action.input.firstRestTeamIndex !== undefined) return { kind: 'invalid' };
    const record = {
      ...(action.kind === 'record' ? { id: crypto.randomUUID(), sequence: games.length + 1, recordedAt: d.now, recordedBy: actorId } : games[index]),
      pair, score: action.input.score, scorers: [...action.input.scorers].sort((a, b) => a.signupId - b.signupId), assists: sortAssists(action.input.assists), firstRestTeamIndex,
      updatedAt: d.now, updatedBy: actorId,
    };
    if (action.kind === 'record') games.push(record); else games[index] = record;
    if (action.kind === 'record' || index === 0 && games.length === 1) currentPair = nextGamePair(state.teamCount, games);
  }
  const result = await commitGameCommand(d, ev, meta, { fingerprint, state: { ...state, games, currentPair }, startedAt: ev.startedAt, completedAt: ev.completedAt });
  if (result.kind === 'ok') await d.sync.request(eventId, { parts: ['event'] });
  return gameCommandResponse(d, eventId, result);
}

export const recordGameResult = (d: Deps, eventId: number, actorId: number, meta: GameMutationMeta, input: GameResultInput): Promise<GameCommandResult> => mutateGames(d, eventId, actorId, meta, { kind: 'record', input });
export const editGameResult = (d: Deps, eventId: number, gameId: string, actorId: number, meta: GameMutationMeta, input: GameResultInput): Promise<GameCommandResult> => mutateGames(d, eventId, actorId, meta, { kind: 'edit', gameId, input });
export const undoLastGame = (d: Deps, eventId: number, actorId: number, meta: GameMutationMeta): Promise<GameCommandResult> => mutateGames(d, eventId, actorId, meta, { kind: 'undo' });

export async function finishGameSession(d: Deps, eventId: number, actorId: number, meta: GameMutationMeta, participantSignupIds: number[]): Promise<GameCommandResult> {
  const ev = await getEvent(d.db, eventId);
  if (!ev) return { kind: 'not_found' };
  const ids = [...participantSignupIds].sort((a, b) => a - b);
  const fingerprint = JSON.stringify({ action: 'finish', participantSignupIds: ids });
  const previous = previousGameCommand(ev, meta, fingerprint);
  if (previous) {
    if (previous.kind === 'ok') await recoverGameReview(d,eventId);
    return gameCommandResponse(d, eventId, previous);
  }
  if (ev.protocolVersion !== 1 || ev.status === 'cancelled') return { kind: 'closed' };
  const state = parseGameState(ev);
  if (!state || ev.startedAt === null) return { kind: 'not_started' };
  if (ev.completedAt !== null) return { kind: 'completed' };
  if (new Set(ids).size !== ids.length || ids.some(id => !state.roster.some(p => p.signupId === id)) || state.games.length > 0 && !ids.length) return { kind: 'invalid' };
  const bill = await getBillByEvent(d.db, eventId);
  const result = await commitGameCommand(d, ev, meta, {
    fingerprint, state: { ...state, finishParticipants: ids, finishedBy: actorId },
    startedAt: ev.startedAt, completedAt: Math.max(d.now, ev.startedAt), status: bill?.status === 'open' ? 'billing' : 'closed', reviewSyncPending:true,
  });
  if (result.kind === 'ok') {
    await recoverGameReview(d,eventId);
  }
  return gameCommandResponse(d, eventId, result);
}
