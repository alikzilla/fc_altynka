import type { StoredGameTimer } from '@altynka/core';
import { clearPendingTimer, readPendingTimer, readTimerDuration, writePendingTimer, writeTimerDuration } from '../src/lib/gameTimerStore';

const timer: StoredGameTimer = { gameSequence: 2, updatedAt: 5, reset: true };
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

test('pending timer is stored per event and cleared', () => {
  writePendingTimer(7, timer);
  expect(localStorage.getItem('altynka:game-timer:7')).not.toBeNull();
  expect(readPendingTimer(7)).toEqual(timer);
  expect(readPendingTimer(8)).toBeNull();
  clearPendingTimer(7);
  expect(readPendingTimer(7)).toBeNull();
});
test('duration defaults to 360 and rejects garbage', () => {
  expect(readTimerDuration()).toBe(360);
  writeTimerDuration(480);
  expect(localStorage.getItem('altynka:game-timer-duration')).toBe('480');
  expect(readTimerDuration()).toBe(480);
  for (const bad of ['abc', '900', '250', '180', '420.5']) {
    localStorage.setItem('altynka:game-timer-duration', bad);
    expect(readTimerDuration()).toBe(360);
  }
});
test('broken JSON in storage reads as null', () => {
  localStorage.setItem('altynka:game-timer:7', '{broken');
  expect(readPendingTimer(7)).toBeNull();
});
test('throwing localStorage never throws', () => {
  const boom = () => { throw new Error('denied'); };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
  expect(readPendingTimer(7)).toBeNull();
  expect(readTimerDuration()).toBe(360);
  expect(() => writePendingTimer(7, timer)).not.toThrow();
  expect(() => writeTimerDuration(300)).not.toThrow();
  expect(() => clearPendingTimer(7)).not.toThrow();
});
