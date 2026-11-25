import type { EventDetailDto, GameProtocolDto, GameResult, GameTimer } from '@altynka/core';
import type { Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { api, ApiError } from '../src/lib/api';
import { buildTrack } from '../src/lib/timerTrack';
import { keepAwake } from '../src/lib/keepAwake';
import { haptic } from '../src/lib/tg';
import { readPendingTimer, readTimerDuration, writePendingTimer } from '../src/lib/gameTimerStore';
import { resetServerClock, toServerTime } from '../src/lib/serverClock';
import { useGameTimer } from '../src/hooks/useGameTimer';
import { makeProtocol } from './gameFixtures';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/timerTrack', () => ({ TRACK_TAIL_SEC: 4, buildTrack: vi.fn() }));
vi.mock('../src/lib/keepAwake', () => ({ keepAwake: vi.fn() }));
vi.mock('../src/lib/tg', () => ({ haptic: vi.fn() }));

class FakeAudio {
  src = ''; currentTime = 0; paused = true; ended = false;
  play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = ''; });
}

const PATH = '/api/events/7/games/timer';
const SKEW = 5000; // the phone clock is 5 s behind the server
let audio: FakeAudio;
let release: Mock<() => void>;
const send = () => vi.mocked(api.send);
const serverTime = () => Date.now() + SKEW;
const game: GameResult = { id: 'game-1', sequence: 1, pair: [0, 1], score: [1, 0], scorers: [], firstRestTeamIndex: 1, recordedAt: 1, recordedBy: 1, updatedAt: 1, updatedBy: 1 };

function evWith(protocol: Partial<GameProtocolDto> = {}): EventDetailDto {
  return { id: 7, serverNow: serverTime(), gameProtocol: makeProtocol({ timer: null, ...protocol }) } as EventDetailDto;
}
function runningFor(sec: number, overrides: Partial<GameTimer> = {}): GameTimer {
  const at = serverTime() - sec * 1000;
  return { gameSequence: 1, durationSec: 360, startedAt: at, pausedAt: null, pausedMs: 0, updatedAt: at, ...overrides };
}
function renderTimer(ev: EventDetailDto) {
  return renderHook(({ ev }) => useGameTimer(ev), { initialProps: { ev } });
}
const flush = () => act(async () => {});
const tick = (ms = 250) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers({ now: 1794139800000 });
  resetServerClock();
  localStorage.clear();
  audio = new FakeAudio();
  vi.spyOn(window, 'Audio').mockImplementation(function () { return audio as unknown as HTMLAudioElement; });
  release = vi.fn<() => void>();
  vi.mocked(keepAwake).mockReturnValue({ release });
  vi.mocked(buildTrack).mockImplementation(async sec => `blob:track-${sec}`);
  send().mockImplementation(async (_method, _path, body) => ({ timer: 'reset' in (body as object) ? null : body }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('start plays the prebuilt track from 0 before sending the tap moment in server time', async () => {
  const { result } = renderTimer(evWith());
  await flush();
  expect(result.current).toMatchObject({ status: 'waiting', remainingSec: 360, phase: 'playing', durationSec: 360, sound: 'off', canControl: true, trackReady: true });
  const tap = toServerTime(performance.now());
  await act(() => result.current.start());
  expect(audio.src).toBe('blob:track-360');
  expect(audio.currentTime).toBe(0);
  expect(audio.play).toHaveBeenCalledTimes(1);
  expect(send()).toHaveBeenCalledWith('PUT', PATH, { gameSequence: 1, durationSec: 360, startedAt: tap, pausedAt: null, pausedMs: 0, updatedAt: tap });
  expect(tap).toBe(serverTime());
  expect(audio.play.mock.invocationCallOrder[0]).toBeLessThan(send().mock.invocationCallOrder[0]);
  expect(result.current).toMatchObject({ status: 'running', sound: 'on' });
  expect(keepAwake).toHaveBeenCalledTimes(1);
  expect(readPendingTimer(7)).toBeNull();
  audio.currentTime = 10;
  await tick();
  expect(result.current.remainingSec).toBe(350);
});

test('offline start still plays, keeps the state pending and re-sends it with the same updatedAt on the next poll', async () => {
  send().mockRejectedValueOnce(new TypeError('Failed to fetch'));
  const { result, rerender } = renderTimer(evWith());
  await flush();
  await act(() => result.current.start());
  const sent = send().mock.calls[0][2] as GameTimer;
  expect(audio.play).toHaveBeenCalled();
  expect(readPendingTimer(7)).toEqual(sent);
  expect(result.current.status).toBe('running');
  await tick(3000);
  rerender({ ev: evWith() });
  await flush();
  expect(send()).toHaveBeenCalledTimes(2);
  expect(send().mock.calls[1]).toEqual(['PUT', PATH, sent]);
  expect(readPendingTimer(7)).toBeNull();
  expect(result.current.status).toBe('running');
  expect(audio.pause).not.toHaveBeenCalled();
  await tick(3000);
  rerender({ ev: evWith({ timer: sent }) });
  expect(send()).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe('running');
});

test('a pending state saved before a reload is re-sent on mount and wins over the older server state', async () => {
  const paused = runningFor(30, { pausedAt: serverTime(), updatedAt: serverTime() });
  writePendingTimer(7, paused);
  send().mockRejectedValue(new TypeError('Failed to fetch'));
  const { result } = renderTimer(evWith({ timer: runningFor(30) }));
  await flush();
  expect(result.current.status).toBe('paused');
  expect(send()).toHaveBeenCalledWith('PUT', PATH, paused);
  expect(readPendingTimer(7)).toEqual(paused);
});

test('a rejected write (4xx) is dropped instead of being retried forever', async () => {
  send().mockRejectedValueOnce(new ApiError(409, 'conflict'));
  const { result, rerender } = renderTimer(evWith());
  await flush();
  await act(() => result.current.start());
  expect(readPendingTimer(7)).toBeNull();
  expect(result.current.status).toBe('waiting');
  rerender({ ev: evWith() });
  await flush();
  expect(send()).toHaveBeenCalledTimes(1);
});

test('a pause from another organizer stops the track and freezes the digits; their resume seeks and plays again', async () => {
  const { result, rerender } = renderTimer(evWith());
  await flush();
  await act(() => result.current.start());
  const started = send().mock.calls[0][2] as GameTimer;
  await tick(20_000);
  audio.currentTime = 20;
  rerender({ ev: evWith({ timer: { ...started, pausedAt: serverTime(), updatedAt: serverTime() } }) });
  expect(audio.pause).toHaveBeenCalled();
  expect(result.current).toMatchObject({ status: 'paused', remainingSec: 340, sound: 'on' });
  expect(release).toHaveBeenCalled();
  await tick(5000);
  expect(result.current.remainingSec).toBe(340);
  audio.play.mockClear();
  rerender({ ev: evWith({ timer: { ...started, pausedAt: null, pausedMs: 3000, updatedAt: serverTime() } }) });
  expect(audio.currentTime).toBe(22);
  expect(audio.play).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('running');
  expect(send()).toHaveBeenCalledTimes(1);
});

test('a reset by another organizer seen after our confirmed start stops the track', async () => {
  const { result, rerender } = renderTimer(evWith());
  await flush();
  await act(() => result.current.start());
  rerender({ ev: evWith() }); // served no later than our confirmed write: still ours
  expect(result.current.status).toBe('running');
  await tick(3000);
  rerender({ ev: evWith() }); // served after it: the server has no timer any more
  expect(audio.pause).toHaveBeenCalled();
  expect(result.current).toMatchObject({ status: 'waiting', sound: 'off' });
  expect(send()).toHaveBeenCalledTimes(1);
});

test('own pause and resume send ordered states and control the track', async () => {
  const { result } = renderTimer(evWith());
  await flush();
  await act(() => result.current.start());
  const started = send().mock.calls[0][2] as GameTimer;
  await tick(30_000);
  audio.currentTime = 30;
  act(() => result.current.pause());
  const pausedAt = serverTime();
  expect(send()).toHaveBeenLastCalledWith('PUT', PATH, { ...started, pausedAt, updatedAt: pausedAt });
  expect(audio.pause).toHaveBeenCalled();
  expect(result.current).toMatchObject({ status: 'paused', remainingSec: 330 });
  await tick(10_000);
  audio.play.mockClear();
  await act(() => result.current.resume());
  expect(send()).toHaveBeenLastCalledWith('PUT', PATH, { ...started, pausedAt: null, pausedMs: 10_000, updatedAt: serverTime() });
  expect(audio.currentTime).toBe(30);
  expect(audio.play).toHaveBeenCalledTimes(1);
  expect(audio.play.mock.invocationCallOrder[0]).toBeLessThan(send().mock.invocationCallOrder[2]);
  expect(result.current.status).toBe('running');
});

test('reset sends a reset marker and stops the sound', async () => {
  const { result } = renderTimer(evWith());
  await flush();
  await act(() => result.current.start());
  await tick(5000);
  act(() => result.current.reset());
  expect(send()).toHaveBeenLastCalledWith('PUT', PATH, { gameSequence: 1, updatedAt: serverTime(), reset: true });
  expect(audio.pause).toHaveBeenCalled();
  expect(result.current).toMatchObject({ status: 'waiting', sound: 'off', remainingSec: 360 });
});

test('after a reload a running timer offers to resume the sound at the elapsed time', async () => {
  const { result } = renderTimer(evWith({ timer: runningFor(100) }));
  await flush();
  expect(result.current).toMatchObject({ status: 'running', sound: 'resumable', trackReady: true });
  expect(result.current.remainingSec).toBeCloseTo(260);
  expect(audio.play).not.toHaveBeenCalled();
  expect(keepAwake).not.toHaveBeenCalled();
  await act(() => result.current.listen());
  expect(audio.currentTime).toBe(100);
  expect(audio.play).toHaveBeenCalledTimes(1);
  expect(result.current.sound).toBe('on');
  expect(keepAwake).toHaveBeenCalled();
  expect(send()).not.toHaveBeenCalled();
});

test('overtime after a reload counts below zero and listen() does not seek past the end of the track', async () => {
  const { result } = renderTimer(evWith({ timer: runningFor(400) }));
  await flush();
  expect(result.current.remainingSec).toBeCloseTo(-40);
  expect(result.current.phase).toBe('over');
  await act(() => result.current.listen());
  expect(audio.play).not.toHaveBeenCalled();
  expect(audio.currentTime).toBeLessThanOrEqual(364);
  await tick(1000);
  expect(result.current.remainingSec).toBeCloseTo(-41);
});

test('a recorded result while the timer runs stops the track, releases the screen and waits for the next game', async () => {
  const { result, rerender } = renderTimer(evWith());
  await flush();
  await act(() => result.current.start());
  expect(release).not.toHaveBeenCalled();
  await tick(3000);
  rerender({ ev: evWith({ games: [game], timer: null }) });
  expect(audio.pause).toHaveBeenCalled();
  expect(release).toHaveBeenCalled();
  expect(result.current).toMatchObject({ status: 'waiting', sound: 'off', remainingSec: 360 });
});

test('a participant without control listens from the current place and never writes the timer', async () => {
  const { result } = renderTimer(evWith({ canRecord: false, timer: runningFor(30) }));
  await flush();
  expect(result.current).toMatchObject({ canControl: false, sound: 'off', status: 'running' });
  await act(() => result.current.listen());
  expect(audio.currentTime).toBe(30);
  expect(audio.play).toHaveBeenCalled();
  expect(result.current.sound).toBe('on');
  await act(async () => { await result.current.start(); result.current.pause(); result.current.reset(); });
  expect(send()).not.toHaveBeenCalled();
  act(() => result.current.mute());
  expect(audio.pause).toHaveBeenCalled();
  expect(release).toHaveBeenCalled();
  expect(result.current.sound).toBe('off');
});

test('the duration can change only while waiting', async () => {
  const { result, rerender } = renderTimer(evWith());
  await flush();
  act(() => result.current.setDurationSec(480));
  expect(result.current).toMatchObject({ durationSec: 480, remainingSec: 480 });
  expect(readTimerDuration()).toBe(480);
  await flush();
  expect(buildTrack).toHaveBeenCalledWith(480);
  expect(result.current.trackReady).toBe(true);
  rerender({ ev: evWith({ timer: runningFor(10) }) });
  await flush();
  act(() => result.current.setDurationSec(600));
  expect(result.current.durationSec).toBe(360);
  expect(readTimerDuration()).toBe(480);
});

test('haptic fires once on each phase change while visible', async () => {
  const { result } = renderTimer(evWith());
  await flush();
  await act(() => result.current.start());
  audio.currentTime = 301;
  await tick();
  expect(result.current.phase).toBe('last_minute');
  await tick();
  expect(haptic).toHaveBeenCalledTimes(1);
  expect(haptic).toHaveBeenCalledWith('heavy');
  audio.currentTime = 346;
  await tick();
  expect(result.current.phase).toBe('last_attack');
  expect(haptic).toHaveBeenCalledTimes(2);
});

test('Media Session shows the game and its lock-screen pause pauses the shared timer', async () => {
  const handlers: Record<string, (() => void) | null> = {};
  const session = { metadata: null as unknown, setActionHandler: vi.fn((action: string, fn: (() => void) | null) => { handlers[action] = fn; }) };
  Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
  vi.stubGlobal('MediaMetadata', function (this: { title: string }, init: { title: string }) { this.title = init.title; });
  try {
    const { result } = renderTimer(evWith());
    await flush();
    await act(() => result.current.start());
    expect(session.metadata).toMatchObject({ title: 'Игра 1 · таймер' });
    await tick(1000);
    await act(async () => handlers.pause?.());
    expect(result.current.status).toBe('paused');
    expect(send()).toHaveBeenLastCalledWith('PUT', PATH, expect.objectContaining({ pausedAt: serverTime() }));
  } finally {
    Reflect.deleteProperty(navigator, 'mediaSession');
    vi.unstubAllGlobals();
  }
});

test('unmount pauses and releases the track and the screen', async () => {
  const { result, unmount } = renderTimer(evWith());
  await flush();
  await act(() => result.current.start());
  unmount();
  expect(audio.pause).toHaveBeenCalled();
  expect(audio.removeAttribute).toHaveBeenCalledWith('src');
  expect(release).toHaveBeenCalled();
});
