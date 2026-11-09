import { calculateStandings, type GamePair, type GameScore, type GameState } from './games';
import type { TeamColor, TeamCount } from './teams';

export interface PlayerShortGame {
  id: string; sequence: number; pair: GamePair; score: GameScore;
  goals: number; assists: number; outcome: 'win' | 'draw' | 'loss';
}
export interface PlayerProtocolSummary {
  games: number; goals: number; assists: number; wins: number; draws: number; losses: number;
  /** At least one of these games was recorded after assists existed. */
  assistsTracked: boolean;
  results: PlayerShortGame[];
}
export interface PlayerStatistics {
  meetings: number; games: number; goals: number; assists: number; assistsTracked: boolean;
  wins: number; draws: number; losses: number; winPercentage: number | null;
  bestGoalsInMeeting: number;
  /** Встречи, где игрок забил три и больше. */
  hatTricks: number;
}
export interface PlayerMeetingStatistics extends PlayerProtocolSummary {
  eventId: number; date: string; place: string | null;
  community: { id: number; title: string }; colors: TeamColor[];
  score: number | null;
}

/** Participation follows the frozen team roster; unknown authors stay unassigned. */
export function summarizePlayerProtocol(state: GameState, userId: number): PlayerProtocolSummary {
  const player = state.roster.find(p => p.userId === userId);
  const results: PlayerShortGame[] = [];
  let assistsTracked = false;
  if (player) for (const game of state.games) {
    const side = game.pair.indexOf(player.teamIndex);
    if (side < 0) continue;
    if (game.assists) assistsTracked = true;
    const difference = game.score[side] - game.score[1 - side];
    results.push({ id: game.id, sequence: game.sequence, pair: game.pair, score: game.score,
      goals: game.scorers.find(s => s.signupId === player.signupId)?.goals ?? 0,
      assists: (game.assists ?? []).reduce((n, a) => n + (a.assistSignupId === player.signupId ? a.goals : 0), 0),
      outcome: difference > 0 ? 'win' : difference < 0 ? 'loss' : 'draw' });
  }
  return { games: results.length, goals: results.reduce((n, g) => n + g.goals, 0),
    assists: results.reduce((n, g) => n + g.assists, 0), assistsTracked,
    wins: results.filter(g => g.outcome === 'win').length,
    draws: results.filter(g => g.outcome === 'draw').length,
    losses: results.filter(g => g.outcome === 'loss').length, results };
}

/** The viewer's own outcome of a finished match, for the result card that closes the night. */
export interface MyMatchResult extends Omit<PlayerProtocolSummary, 'results'> {
  teamIndex: number; teamCount: TeamCount; teamRank: number; colors: TeamColor[];
}

export function myMatchResult(state: GameState, userId: number, colors: TeamColor[]): MyMatchResult | null {
  const player = state.roster.find(p => p.userId === userId);
  if (!player || !state.games.length) return null;
  const { results: _results, ...summary } = summarizePlayerProtocol(state, userId);
  const teamRank = calculateStandings(state.teamCount, state.games).find(row => row.teamIndex === player.teamIndex)?.rank ?? 1;
  return { ...summary, teamIndex: player.teamIndex, teamCount: state.teamCount, teamRank, colors };
}

export function aggregatePlayerStatistics(rows: readonly PlayerProtocolSummary[]): PlayerStatistics {
  const result: PlayerStatistics = { meetings: 0, games: 0, goals: 0, assists: 0, assistsTracked: false,
    wins: 0, draws: 0, losses: 0, winPercentage: null, bestGoalsInMeeting: 0, hatTricks: 0 };
  for (const row of rows) {
    if (!row.games) continue;
    result.meetings++;
    for (const key of ['games', 'goals', 'assists', 'wins', 'draws', 'losses'] as const) result[key] += row[key];
    result.assistsTracked ||= row.assistsTracked;
    result.bestGoalsInMeeting = Math.max(result.bestGoalsInMeeting, row.goals);
    if (row.goals >= 3) result.hatTricks++;
  }
  result.winPercentage = result.games ? Math.round(result.wins / result.games * 100) : null;
  return result;
}
