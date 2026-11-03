import { canRestore, demotedIds, limitFor, promotedIds, splitQueue } from '../src';

const e = (seq: number, manual = false) => ({ id: seq, seq, manual });
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

test('manual promotion adds a seat over the limit', () => {
  const list = Array.from({ length: 12 }, (_, i) => e(i + 1, i + 1 === 12));
  const s = splitQueue(list, 10);
  expect(ids(s.main)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  expect(ids(s.reserve)).toEqual([11]);
  expect(s.limit).toBe(11);
});

test('leaver from main is replaced by first reservist, manual keeps its seat', () => {
  const list = Array.from({ length: 12 }, (_, i) => e(i + 1, i + 1 === 12)).filter(x => x.seq !== 3);
  expect(ids(splitQueue(list, 10).main)).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
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
