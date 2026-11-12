import { expect, test } from 'vitest';
import { leaderboardValue, mergeLeaderboard, rankLeaderboard, type LeaderboardDto, type LeaderboardRowDto } from '../src';

const row = (userId: number, displayName: string, over: Partial<LeaderboardRowDto> = {}): LeaderboardRowDto =>
  ({ userId, displayName, photoUrl: null, rating: 5, meetings: 1, games: 4, goals: 0, assists: 0, assistsTracked: true, wins: 0, ...over });
const groups: LeaderboardDto['groups'] = [
  { community: { id: 1, title: 'A' }, players: [row(1, 'Алихан', { goals: 5, assists: 2, wins: 3 }), row(2, 'Дамир', { goals: 6, assists: 0, assistsTracked: false })] },
  { community: { id: 2, title: 'B' }, players: [row(1, 'Алихан', { goals: 2, assists: 1, games: 3, wins: 1, meetings: 2 }), row(3, 'Ернар', { goals: 6, assists: 4 })] },
];

test('all groups merge a person into one row, a single group keeps its own numbers', () => {
  const all = mergeLeaderboard(groups, null);
  expect(all).toHaveLength(3);
  expect(all.find(p => p.userId === 1)).toMatchObject({ goals: 7, assists: 3, games: 7, wins: 4, meetings: 3 });
  expect(mergeLeaderboard(groups, 2).map(p => [p.userId, p.goals])).toEqual([[1, 2], [3, 6]]);
  expect(groups[0].players[0].goals).toBe(5);
});

test('ranking breaks ties by goals, assists, then fewer games', () => {
  const all = mergeLeaderboard(groups, null);
  expect(rankLeaderboard(all, 'goals').map(p => p.userId)).toEqual([1, 3, 2]);
  expect(rankLeaderboard(all, 'points').map(p => p.userId)).toEqual([1, 3, 2]);
  expect(rankLeaderboard(all, 'wins').map(p => p.userId)).toEqual([1, 3, 2]);
});

test('untracked assists are unknown, not zero, and rank last', () => {
  const all = mergeLeaderboard(groups, null);
  const damir = all.find(p => p.userId === 2)!;
  expect(leaderboardValue(damir, 'assists')).toBeNull();
  expect(leaderboardValue(damir, 'points')).toBe(6);
  expect(rankLeaderboard(all, 'assists').map(p => p.userId)).toEqual([3, 1, 2]);
});
