import { computeBill, lineStatus } from '../src';

const ones = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: i + 1, units: 1 }));

test('splits field + extras, rounds share up to 50', () => {
  const b = computeBill(20000, [{ label: 'Вода', amount: 1500 }], ones(10));
  expect(b.total).toBe(21500);
  expect(b.share).toBe(2150);
  expect(b.lines[0].amount).toBe(2150);
  expect(computeBill(20000, [], ones(12)).share).toBe(1700);
});

test('guest units multiply the line', () => {
  // 10 долей: у первого 2 (он + гость), у остальных восьми по одной
  const b = computeBill(20000, [], [{ userId: 1, units: 2 }, ...ones(8).map(x => ({ ...x, userId: x.userId + 1 }))]);
  expect(b.share).toBe(2000);
  expect(b.lines[0].amount).toBe(4000);
});

test('no payers throws', () => {
  expect(() => computeBill(1000, [], [])).toThrow();
});

test('lineStatus', () => {
  expect(lineStatus(2000, null)).toEqual({ state: 'unpaid', due: 2000 });
  expect(lineStatus(2000, 2000)).toEqual({ state: 'paid', due: 0 });
  expect(lineStatus(2500, 2000)).toEqual({ state: 'underpaid', due: 500 });
  expect(lineStatus(2000, 2500)).toEqual({ state: 'paid', due: 0 });
});
