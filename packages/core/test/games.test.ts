import { calculateScorers, calculateStandings, chooseFirstPair, chooseKickoff, nextGamePair, resolveFirstRest, type GamePair, type GameResult } from '../src';

const game = (pair: GamePair, score: readonly [number, number], firstRestTeamIndex: number | null = null): GameResult => ({
  id: 'game', sequence: 1, pair, score, scorers: [], firstRestTeamIndex,
  recordedAt: 1, recordedBy: 1, updatedAt: 1, updatedBy: 1,
});

test('first pair covers every possible pair, two teams always play each other', () => {
  expect([0, 0.4, 0.9].map(n => chooseFirstPair(3, () => n))).toEqual([[0, 1], [0, 2], [1, 2]]);
  expect(chooseFirstPair(2, () => 0.9)).toEqual([0, 1]);
});

test('first loss rests; first draw requires a real sulifa choice', () => {
  expect(resolveFirstRest([0, 1], [2, 1])).toBe(1);
  expect(resolveFirstRest([0, 1], [0, 1])).toBe(0);
  expect(resolveFirstRest([0, 1], [0, 0], 0)).toBe(0);
  expect(resolveFirstRest([0, 1], [1, 1], 1)).toBe(1);
  expect(() => resolveFirstRest([0, 1], [0, 0])).toThrow();
  expect(() => resolveFirstRest([0, 1], [0, 0], 2)).toThrow();
  expect(() => resolveFirstRest([0, 1], [2, 1], 0)).toThrow();
});

test.each([[[0, 1], 0], [[0, 2], 0], [[1, 2], 1]] as const)('all initial pairs rotate after two consecutive appearances', (pair, winner) => {
  const rest = pair.find(t => t !== winner)!;
  const waiting = [0, 1, 2].find(t => t !== pair[0] && t !== pair[1])!;
  const games = [game(pair, [1, 0], rest)];
  expect(nextGamePair(3, games)).toEqual([winner, waiting].sort());
  for (let i = 0; i < 10; i++) {
    const next = nextGamePair(3, games);
    games.push(game(next, i % 2 ? [0, 0] : [0, 1]));
    const repeated = games.at(-2)!.pair.find(t => next.includes(t))!;
    expect(nextGamePair(3, games)).not.toContain(repeated);
  }
});

test.each([0, 1])('first draw preserves the chosen rest team %i', rest => {
  const first = game([0, 1], [0, 0], rest);
  expect(nextGamePair(3, [first])).toEqual([rest === 0 ? 1 : 0, 2]);
  expect(first.score).toEqual([0, 0]);
  expect(nextGamePair(2, [first])).toEqual([0, 1]);
});

test('standings count actual appearances and use 3/1/0 points', () => {
  const rows = calculateStandings(3, [game([0, 1], [2, 1], 1), game([0, 2], [0, 0])]);
  expect(rows.map(r => r.teamIndex)).toEqual([0, 2, 1]);
  expect(rows[0]).toMatchObject({ rank: 1, played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points: 4 });
  expect(rows[1]).toMatchObject({ played: 1, points: 1 });
  expect(rows[2]).toMatchObject({ played: 1, points: 0 });
  expect(calculateStandings(3, []).map(r => [r.rank, r.points, r.played])).toEqual([[1, 0, 0], [1, 0, 0], [1, 0, 0]]);
});

test('scorers use signup identity, count multiple goals, keep guests distinct and omit unknown goals', () => {
  const g = game([0, 1], [3, 1], 1);
  g.scorers = [{ signupId: 10, goals: 2 }, { signupId: 11, goals: 1 }];
  const rows = calculateScorers([
    { signupId: 10, userId: null, name: 'Гость', teamIndex: 0 },
    { signupId: 11, userId: null, name: 'Гость', teamIndex: 1 },
  ], [g]);
  expect(rows.map(r => [r.signupId, r.goals])).toEqual([[10, 2], [11, 1]]);
  expect(rows[0].userId).toBeNull();
  expect(calculateScorers([], [])).toEqual([]);
});

test('kickoff for two teams is a fair 0/1 draw',()=>{
  expect([0,0.49,0.5,0.99].map(n=>chooseKickoff(()=>n))).toEqual([0,0,1,1]);
});
