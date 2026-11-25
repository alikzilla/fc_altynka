import { eq } from 'drizzle-orm';
import type { GameTimer, StoredGameTimer } from '@altynka/core';
import { events } from '../../src/db/schema';
import { getEvent } from '../../src/domain/events';
import { getGameProtocol, startGameSession } from '../../src/domain/gameStart';
import { recordGameResult, undoLastGame } from '../../src/domain/games';
import { setGameTimer } from '../../src/domain/gameTimer';
import type { FakeSync } from '../fakes/fakeSync';
import { gameFixture } from './gameFixture';

const timerAt = (now: number, over: Partial<GameTimer> = {}): GameTimer => ({
  gameSequence: 1, durationSec: 360, startedAt: now, pausedAt: null, pausedMs: 0, updatedAt: now + 1000, ...over,
});

async function started() {
  const w = await gameFixture();
  await startGameSession(w.d, w.eventId, w.actorId, { requestId: 'start', expectedRevision: 0 });
  (w.d.sync as FakeSync).calls.length = 0;
  return w;
}

test('saves the timer without touching the revision or Telegram', async () => {
  const w = await started();
  const before = await getEvent(w.d.db, w.eventId);
  const t = timerAt(w.d.now);
  expect(await setGameTimer(w.d, w.eventId, t)).toEqual({ kind: 'ok', timer: t });
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toEqual(t);
  expect((await getEvent(w.d.db, w.eventId))?.gameRevision).toBe(before?.gameRevision);
  expect((w.d.sync as FakeSync).calls).toHaveLength(0);
});

test('conflicts when no game is waiting for the timer', async () => {
  const w = await started();
  expect((await setGameTimer(w.d, w.eventId, timerAt(w.d.now, { gameSequence: 2 }))).kind).toBe('conflict');
  await w.d.db.update(events).set({ completedAt: w.d.now }).where(eq(events.id, w.eventId));
  expect((await setGameTimer(w.d, w.eventId, timerAt(w.d.now))).kind).toBe('conflict');
  expect((await setGameTimer(w.d, 999999, timerAt(w.d.now))).kind).toBe('not_found');
});

test('conflicts before the protocol is started', async () => {
  const w = await gameFixture();
  expect((await setGameTimer(w.d, w.eventId, timerAt(w.d.now))).kind).toBe('conflict');
});

test.each([
  ['too short', { durationSec: 200 }],
  ['not a whole minute', { durationSec: 390 }],
  ['too long', { durationSec: 660 }],
  ['started long ago', { startedAt: -7 * 3600_000 }],
  ['negative pause', { pausedMs: -1 }],
  ['paused before start', { pausedAt: -1 }],
])('rejects invalid timer: %s', async (_name, over) => {
  const w = await started();
  const o = Object.fromEntries(Object.entries(over).map(([k, v]) => [k, k === 'startedAt' || k === 'pausedAt' ? w.d.now + (v as number) : v]));
  const t = timerAt(w.d.now, o as Partial<GameTimer>);
  expect((await setGameTimer(w.d, w.eventId, t)).kind).toBe('invalid');
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toBeNull();
});

test('an older update is ignored and answers with the stored timer', async () => {
  const w = await started();
  const newer = timerAt(w.d.now, { updatedAt: w.d.now + 2000, durationSec: 300 });
  await setGameTimer(w.d, w.eventId, newer);
  expect(await setGameTimer(w.d, w.eventId, timerAt(w.d.now, { updatedAt: w.d.now + 1000 }))).toEqual({ kind: 'ok', timer: newer });
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toEqual(newer);
});

test('a reset clears the timer and keeps ordering', async () => {
  const w = await started();
  await setGameTimer(w.d, w.eventId, timerAt(w.d.now, { updatedAt: w.d.now + 2000 }));
  const reset: StoredGameTimer = { gameSequence: 1, updatedAt: w.d.now + 3000, reset: true };
  expect(await setGameTimer(w.d, w.eventId, reset)).toEqual({ kind: 'ok', timer: null });
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toBeNull();
  expect(await setGameTimer(w.d, w.eventId, timerAt(w.d.now, { updatedAt: w.d.now + 2500 }))).toEqual({ kind: 'ok', timer: null });
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toBeNull();
});

test('recording a result does not conflict with a timer write and retires the timer', async () => {
  const w = await started();
  const rev = (await getEvent(w.d.db, w.eventId))!.gameRevision;
  await setGameTimer(w.d, w.eventId, timerAt(w.d.now));
  const r = await recordGameResult(w.d, w.eventId, w.actorId, { requestId: 'r1', expectedRevision: rev }, { score: [1, 0], scorers: [] });
  expect(r.kind).toBe('ok');
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toBeNull();
});

test('a timer for the next game is not ordered against the previous game timer', async () => {
  const w = await started();
  const rev = (await getEvent(w.d.db, w.eventId))!.gameRevision;
  await setGameTimer(w.d, w.eventId, timerAt(w.d.now, { updatedAt: w.d.now + 5000 }));
  await recordGameResult(w.d, w.eventId, w.actorId, { requestId: 'r1', expectedRevision: rev }, { score: [1, 0], scorers: [] });
  const next = timerAt(w.d.now, { gameSequence: 2, updatedAt: w.d.now + 1000 });
  expect(await setGameTimer(w.d, w.eventId, next)).toEqual({ kind: 'ok', timer: next });
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toEqual(next);
});

test('a corrupt stored timer reads as no timer instead of failing the match page, and the next write replaces it', async () => {
  const w = await started();
  await w.d.db.update(events).set({ gameTimerJson: '{not json' }).where(eq(events.id, w.eventId));
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toBeNull();
  const t = timerAt(w.d.now);
  expect(await setGameTimer(w.d, w.eventId, t)).toEqual({ kind: 'ok', timer: t });
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toEqual(t);
  await w.d.db.update(events).set({ gameTimerJson: '42' }).where(eq(events.id, w.eventId));
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toBeNull();
});

test('undo brings back the stored timer of the undone game when the next game has none yet', async () => {
  const w = await started();
  const rev = (await getEvent(w.d.db, w.eventId))!.gameRevision;
  const first = timerAt(w.d.now - 400_000, { updatedAt: w.d.now - 399_000 });
  await setGameTimer(w.d, w.eventId, first);
  const r = await recordGameResult(w.d, w.eventId, w.actorId, { requestId: 'r1', expectedRevision: rev }, { score: [1, 0], scorers: [] });
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toBeNull();
  // That is the real state of game 1 again: its time ran on, usually into added time.
  await undoLastGame(w.d, w.eventId, w.actorId, { requestId: 'u1', expectedRevision: r.kind === 'ok' ? r.appliedRevision : 0 });
  expect((await getGameProtocol(w.d, w.eventId, false))?.timer).toEqual(first);
});
