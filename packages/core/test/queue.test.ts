import { MATCH_FORMATS, MATCH_LIMITS, canRestore, demotedIds, limitFor, matchFormat, promotedIds, splitQueue } from '../src';

const e = (seq: number) => ({ id: seq, seq });
const ids = (xs: { id: number }[]) => xs.map(x => x.id);

test('limitFor', () => {
  expect(limitFor(null)).toBe(10);
  expect(limitFor(1)).toBe(10);
  expect(limitFor(2)).toBe(15);
});

test('first N by seq are main, rest reserve, input order ignored', () => {
  const s = splitQueue([12, 3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11].map(n => e(n)), 10);
  expect(ids(s.main)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(ids(s.reserve)).toEqual([11, 12]);
  expect(s.limit).toBe(10);
});

test('the queue is strict: an old manual flag neither jumps it nor adds a seat', () => {
  const list = Array.from({ length: 12 }, (_, i) => ({ ...e(i + 1), manual: i + 1 === 12 }));
  const s = splitQueue(list, 10);
  expect(ids(s.main)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(ids(s.reserve)).toEqual([11, 12]);
  expect(s.limit).toBe(10);
});

test('leaver from main is replaced by the first reservist', () => {
  const list = Array.from({ length: 12 }, (_, i) => e(i + 1)).filter(x => x.seq !== 3);
  const s = splitQueue(list, 10);
  expect(ids(s.main)).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(ids(s.reserve)).toEqual([12]);
});

test('2h -> 1h sends last non-manual back to reserve in order', () => {
  const list = Array.from({ length: 16 }, (_, i) => e(i + 1));
  const a = splitQueue(list, 15);
  const b = splitQueue(list, 10);
  expect(ids(b.reserve)).toEqual([11, 12, 13, 14, 15, 16]);
  expect(demotedIds(a, b)).toEqual([11, 12, 13, 14, 15]);
  expect(promotedIds(b, a)).toEqual([11, 12, 13, 14, 15]);
});

test('canRestore window', () => {
  expect(canRestore(1_000_000 - 119_999, 1_000_000)).toBe(true);
  expect(canRestore(1_000_000 - 120_001, 1_000_000)).toBe(false);
  expect(canRestore(null, 1_000_000)).toBe(false);
});

test('match formats: two or three teams of five or six', () => {
  expect(MATCH_LIMITS).toEqual([10, 12, 15, 18]);
  for (const f of MATCH_FORMATS) expect(f.teamSize * f.teamCount).toBe(f.limit);
  expect(matchFormat(12)?.label).toBe('6×6');
  expect(matchFormat(18)?.label).toBe('6×6×6');
  expect(matchFormat(11)).toBeUndefined();
});
