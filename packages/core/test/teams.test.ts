import { alternativeSplit, balanceTeams, makeRng, teamCountFor, teamColorsFor, teamAppearance, TEAMS, type Rated } from '../src';

test('team colors preserve legacy defaults and resolve actual uniforms', () => {
  expect(teamColorsFor(2)).toEqual(['red', 'blue']);
  expect(teamColorsFor(3)).toEqual(['red', 'blue', 'yellow']);
  expect(teamAppearance(1, ['blue', 'green'])).toMatchObject({ key: 'green', name: 'Зелёные' });
  expect(teamAppearance(0, ['white', 'black'])).toMatchObject({ key: 'white', name: 'Белые' });
  expect(teamAppearance(1, ['white', 'black'])).toMatchObject({ key: 'black', name: 'Чёрные' });
});

test('adding a third team preserves selected colors without duplicates', () => {
  expect(teamColorsFor(3, ['green', 'yellow'])).toEqual(['green', 'yellow', 'red']);
  expect(teamColorsFor(2, ['blue', 'red', 'yellow'])).toEqual(['blue', 'red']);
  expect(teamColorsFor(3, ['red', 'red', 'unknown'])).toEqual(['red', 'blue', 'yellow']);
});

const P = (levels: number[]) => levels.map((level, i) => ({ id: i + 1, level }));
const sums = (players: Rated[], t: number[][]) =>
  t.map(ids => ids.reduce((s, id) => s + players.find(p => p.id === id)!.level, 0));
const canon = (t: number[][]) =>
  JSON.stringify(t.map(x => [...x].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]));

test('TEAMS are red, blue, yellow', () => {
  expect(TEAMS.map(t => t.name)).toEqual(['Красные', 'Синие', 'Жёлтые']);
});

test('teamCountFor', () => {
  expect(teamCountFor(10)).toBe(2);
  expect(teamCountFor(14)).toBe(2);
  expect(teamCountFor(15)).toBe(3);
});

test('10 players -> 2x5, optimal spread 1', () => {
  const ps = P([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  const t = balanceTeams(ps, 2, makeRng(1));
  expect(t.map(x => x.length)).toEqual([5, 5]);
  const s = sums(ps, t);
  expect(Math.max(...s) - Math.min(...s)).toBe(1);
});

test('15 players -> 3x5, spread <= 1, every id exactly once', () => {
  const ps = P([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5].map((x, i) => x + (i % 3)));
  const t = balanceTeams(ps, 3, makeRng(7));
  expect(t.map(x => x.length)).toEqual([5, 5, 5]);
  expect(t.flat().sort((a, b) => a - b)).toEqual(ps.map(p => p.id));
  const s = sums(ps, t);
  expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
});

test('11 players -> sizes 6 and 5', () => {
  expect(balanceTeams(P(Array(11).fill(5)), 2).map(x => x.length)).toEqual([6, 5]);
});

test('alternativeSplit differs from current and is within best+1', () => {
  const ps = P([7, 7, 6, 6, 5, 5, 5, 4, 4, 3]);
  const best = balanceTeams(ps, 2, makeRng(3));
  const alt = alternativeSplit(ps, 2, best, makeRng(4));
  expect(canon(alt)).not.toBe(canon(best));
  const sb = sums(ps, best);
  const sa = sums(ps, alt);
  expect(Math.max(...sa) - Math.min(...sa)).toBeLessThanOrEqual(Math.max(...sb) - Math.min(...sb) + 1);
});
