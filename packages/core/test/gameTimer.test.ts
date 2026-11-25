import { currentTimer, timerCues, timerElapsedMs, timerPhase, timerRemainingSec, type GameTimer } from '../src';

const timer = (over: Partial<GameTimer> = {}): GameTimer => ({
  gameSequence: 3, durationSec: 360, startedAt: 1000, pausedAt: null, pausedMs: 0, updatedAt: 1000, ...over,
});

describe('timerElapsedMs', () => {
  it('stops counting at pausedAt and subtracts paused time', () => {
    expect(timerElapsedMs(timer({ pausedAt: 61000, pausedMs: 5000 }), 999999)).toBe(55000);
  });
  it('runs to serverNow without a pause', () => {
    expect(timerElapsedMs(timer({ pausedMs: 1000 }), 31000)).toBe(29000);
  });
  it('is never negative', () => {
    expect(timerElapsedMs(timer(), 500)).toBe(0);
  });
});

describe('timerRemainingSec', () => {
  it('goes negative for added time', () => {
    expect(timerRemainingSec(timer(), 1000 + 370_000)).toBe(-10);
  });
});

describe('timerPhase', () => {
  it.each([
    [61, 'playing'], [60, 'last_minute'], [16, 'last_minute'], [15, 'last_attack'],
    [0.5, 'last_attack'], [0, 'over'], [-3, 'over'],
  ] as const)('%s -> %s', (sec, phase) => {
    expect(timerPhase(sec)).toBe(phase);
  });
});

describe('timerCues', () => {
  it('lists start, last minute, last attack and end', () => {
    expect(timerCues(360)).toEqual([
      { atSec: 0, kind: 'start' }, { atSec: 300, kind: 'last_minute' },
      { atSec: 345, kind: 'last_attack' }, { atSec: 360, kind: 'end' },
    ]);
  });
});

describe('currentTimer', () => {
  it('returns the timer of the next game', () => {
    const t = timer();
    expect(currentTimer(t, 2)).toBe(t);
  });
  it('drops a timer of another game', () => {
    expect(currentTimer(timer(), 3)).toBeNull();
  });
  it('treats a reset marker and nothing as no timer', () => {
    expect(currentTimer({ gameSequence: 3, updatedAt: 1, reset: true }, 2)).toBeNull();
    expect(currentTimer(null, 2)).toBeNull();
  });
});
