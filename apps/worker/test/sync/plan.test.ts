import { mergeNotices, nextAlarmAt, unmerge } from '../../src/sync/plan';

test('nextAlarmAt waits 300ms to collect a burst and respects 3s gap', () => {
  expect(nextAlarmAt(10_000, null)).toBe(10_300);
  expect(nextAlarmAt(10_000, 9_000)).toBe(12_000);
  expect(nextAlarmAt(10_000, 1_000)).toBe(10_300);
});

test('mergeNotices merges moves and filters by current state', () => {
  const r = mergeNotices(
    [{ kind: 'promoted', signupIds: [1, 2] }, { kind: 'promoted', signupIds: [3] }, { kind: 'scheduled' }, { kind: 'demoted', signupIds: [4] }],
    new Set([1, 3]),
  );
  expect(r).toEqual([{ kind: 'moves', promoted: [1, 3], demoted: [4], scheduled: true }]);
});

test('promoted then demoted within the window produces nothing', () => {
  expect(mergeNotices([{ kind: 'promoted', signupIds: [5] }, { kind: 'demoted', signupIds: [5] }], new Set())).toEqual([]);
});

test('cancelled wins, reminders dedupe', () => {
  expect(mergeNotices([{ kind: 'promoted', signupIds: [1] }, { kind: 'cancelled' }], new Set([1]))).toEqual([{ kind: 'cancelled' }]);
  expect(mergeNotices([{ kind: 'reminder', billId: 2 }, { kind: 'reminder', billId: 2 }], new Set())).toEqual([{ kind: 'reminder', billId: 2 }]);
});

test('unmerge round-trips', () => {
  expect(unmerge({ kind: 'moves', promoted: [1], demoted: [2], scheduled: true })).toEqual([
    { kind: 'scheduled' }, { kind: 'promoted', signupIds: [1] }, { kind: 'demoted', signupIds: [2] },
  ]);
});
