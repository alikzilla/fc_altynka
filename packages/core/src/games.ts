import type { TeamCount } from './teams';

export type GamePair = readonly [number, number];
export type GameScore = readonly [number, number];
export interface GameRosterPlayer { signupId: number; userId: number | null; name: string; teamIndex: number }
export interface GameGoals { signupId: number; goals: number }
export interface GameResult {
  id: string; sequence: number; pair: GamePair; score: GameScore;
  scorers: GameGoals[]; firstRestTeamIndex: number | null;
  recordedAt: number; recordedBy: number; updatedAt: number; updatedBy: number;
}
export interface GameCommandReceipt { requestId: string; fingerprint: string; revision: number }
export interface GameState {
  teamCount: TeamCount; roster: GameRosterPlayer[];
  initialPair: GamePair; currentPair: GamePair; games: GameResult[];
  receipts: GameCommandReceipt[]; finishParticipants: number[] | null;
}
export interface GameMutationMeta { requestId: string; expectedRevision: number }
export interface GameResultInput { score: GameScore; scorers: GameGoals[]; firstRestTeamIndex?: number }
export interface TeamStanding {
  teamIndex: number; rank: number; played: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
}
export interface ScorerTotal extends GameRosterPlayer { rank: number; goals: number }
export interface GameProtocolDto {
  state: 'legacy' | 'not_started' | 'playing' | 'completed'; revision: number;
  startedAt: number | null; completedAt: number | null; teamCount: TeamCount | null;
  roster: GameRosterPlayer[]; currentPair: GamePair | null; restingTeamIndex: number | null;
  games: GameResult[]; standings: TeamStanding[]; scorers: ScorerTotal[];
  canStart: boolean; canRecord: boolean; canEdit: boolean; canUndo: boolean; canFinish: boolean;
}

export function chooseFirstPair(count: TeamCount, rng: () => number = Math.random): GamePair {
  return count === 2 ? [0, 1] : ([[0, 1], [0, 2], [1, 2]] as const)[Math.min(2, Math.floor(rng() * 3))];
}

export function resolveFirstRest(pair: GamePair, score: GameScore, chosen?: number): number {
  const rest = score[0] === score[1] ? chosen : pair[score[0] > score[1] ? 1 : 0];
  if (rest === undefined || !pair.includes(rest) || chosen !== undefined && chosen !== rest) throw new Error('invalid_first_rest');
  return rest;
}

export function nextGamePair(count: TeamCount, games: readonly GameResult[]): GamePair {
  if (count === 2) return [0, 1];
  if (!games.length) throw new Error('missing_first_game');
  const last = games[games.length - 1];
  const rest = games.length === 1 ? last.firstRestTeamIndex : last.pair.find(t => games[games.length - 2].pair.includes(t));
  if (rest === undefined || rest === null) throw new Error('missing_rotation_decision');
  const remaining = [0, 1, 2].filter(t => t !== rest);
  return [remaining[0], remaining[1]];
}

export function calculateStandings(count: TeamCount, games: readonly GameResult[]): TeamStanding[] {
  const rows: TeamStanding[] = Array.from({ length: count }, (_, teamIndex) => ({ teamIndex, rank: 1, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }));
  for (const game of games) for (const side of [0, 1] as const) {
    const row = rows[game.pair[side]];
    const scored = game.score[side], conceded = game.score[1 - side];
    row.played++; row.goalsFor += scored; row.goalsAgainst += conceded;
    if (scored > conceded) { row.wins++; row.points += 3; }
    else if (scored === conceded) { row.draws++; row.points++; }
    else row.losses++;
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }
  rows.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.teamIndex - b.teamIndex);
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.rank = prev && prev.points === row.points && prev.goalDifference === row.goalDifference && prev.goalsFor === row.goalsFor ? prev.rank : i + 1;
  });
  return rows;
}

export function calculateScorers(roster: readonly GameRosterPlayer[], games: readonly GameResult[]): ScorerTotal[] {
  const totals = new Map<number, number>();
  for (const game of games) for (const scorer of game.scorers) totals.set(scorer.signupId, (totals.get(scorer.signupId) ?? 0) + scorer.goals);
  const rows = roster.filter(p => totals.has(p.signupId)).map(p => ({ ...p, goals: totals.get(p.signupId)!, rank: 1 }));
  rows.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'ru') || a.signupId - b.signupId);
  rows.forEach((row, i) => { row.rank = i > 0 && rows[i - 1].goals === row.goals ? rows[i - 1].rank : i + 1; });
  return rows;
}
