import type { EventDetailDto, GameProtocolDto, GameTimer } from '@altynka/core';
import { ApiError } from '../src/lib/api';
import { effectiveTimer, isFinalRejection } from '../src/lib/gameTimerState';
import { makeProtocol } from './gameFixtures';

const timer = (updatedAt: number, overrides: Partial<GameTimer> = {}): GameTimer =>
  ({ gameSequence: 1, durationSec: 360, startedAt: 1000, pausedAt: null, pausedMs: 0, updatedAt, ...overrides });
const ev = (protocol: Partial<GameProtocolDto>, serverNow = 5000) =>
  ({ id: 7, serverNow, gameProtocol: makeProtocol({ timer: null, ...protocol }) }) as EventDetailDto;
const game = { id: 'g1', sequence: 1, pair: [0, 1] as [number, number], score: [1, 0] as [number, number], scorers: [], firstRestTeamIndex: 1, recordedAt: 1, recordedBy: 1, updatedAt: 1, updatedBy: 1 };

test('no timer outside a playing protocol, whatever this device wrote', () => {
  expect(effectiveTimer(ev({ state: 'completed', timer: timer(2000) }), { timer: timer(3000), confirmedAt: null })).toBeNull();
});
test('the newer write wins; a tie goes to the server', () => {
  expect(effectiveTimer(ev({ timer: timer(2000) }), { timer: timer(3000, { pausedAt: 3000 }), confirmedAt: null })?.pausedAt).toBe(3000);
  expect(effectiveTimer(ev({ timer: timer(3000, { durationSec: 480 }) }), { timer: timer(3000), confirmedAt: null })?.durationSec).toBe(480);
  expect(effectiveTimer(ev({ timer: timer(4000) }), { timer: timer(3000), confirmedAt: null })?.updatedAt).toBe(4000);
});
test('a write for another game is ignored', () => {
  expect(effectiveTimer(ev({ games: [game] }), { timer: timer(3000), confirmedAt: null })).toBeNull();
});
test('a pending write or reset beats a missing server timer', () => {
  expect(effectiveTimer(ev({}), { timer: timer(3000), confirmedAt: null })?.updatedAt).toBe(3000);
  expect(effectiveTimer(ev({ timer: timer(2000) }), { timer: { gameSequence: 1, updatedAt: 3000, reset: true }, confirmedAt: null })).toBeNull();
});
test('a confirmed write gives way to a missing server timer only in a snapshot served after the confirmation', () => {
  const local = { timer: timer(3000), confirmedAt: 4000 };
  expect(effectiveTimer(ev({}, 4000), local)?.updatedAt).toBe(3000);
  expect(effectiveTimer(ev({}, 4001), local)).toBeNull();
});
test('only final client errors stop the retries', () => {
  expect(isFinalRejection(new ApiError(409, 'conflict'))).toBe(true);
  expect(isFinalRejection(new ApiError(400, 'invalid'))).toBe(true);
  expect(isFinalRejection(new ApiError(429, 'rate'))).toBe(false);
  expect(isFinalRejection(new ApiError(503, 'down'))).toBe(false);
  expect(isFinalRejection(new TypeError('Failed to fetch'))).toBe(false);
});
