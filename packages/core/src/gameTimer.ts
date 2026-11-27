export const GAME_TIMER_MIN_SEC = 240;
export const GAME_TIMER_MAX_SEC = 600;
export const GAME_TIMER_DEFAULT_SEC = 360;
export const LAST_MINUTE_SEC = 60;
export const LAST_ATTACK_SEC = 15;

export interface GameTimer {
  gameSequence: number; durationSec: number; startedAt: number;
  pausedAt: number | null; pausedMs: number; updatedAt: number;
}
export interface GameTimerReset { gameSequence: number; updatedAt: number; reset: true }
export type StoredGameTimer = GameTimer | GameTimerReset;

export function timerElapsedMs(t: GameTimer, serverNow: number): number {
  return Math.max(0, (t.pausedAt ?? serverNow) - t.startedAt - t.pausedMs);
}

// Negative once the planned time is over (added time).
export function timerRemainingSec(t: GameTimer, serverNow: number): number {
  return t.durationSec - timerElapsedMs(t, serverNow) / 1000;
}

export type TimerPhase = 'playing' | 'last_minute' | 'last_attack' | 'over';

export function timerPhase(remainingSec: number): TimerPhase {
  if (remainingSec > LAST_MINUTE_SEC) return 'playing';
  if (remainingSec > LAST_ATTACK_SEC) return 'last_minute';
  if (remainingSec > 0) return 'last_attack';
  return 'over';
}

export type TimerCue = { atSec: number; kind: 'start' | 'last_minute' | 'last_attack' | 'end' };

export function timerCues(durationSec: number): TimerCue[] {
  return [
    { atSec: 0, kind: 'start' },
    { atSec: durationSec - LAST_MINUTE_SEC, kind: 'last_minute' },
    { atSec: durationSec - LAST_ATTACK_SEC, kind: 'last_attack' },
    { atSec: durationSec, kind: 'end' },
  ];
}

// The stored timer counts only for the game that is about to be played.
export function currentTimer(stored: StoredGameTimer | null, gamesPlayed: number): GameTimer | null {
  if (!stored || 'reset' in stored) return null;
  return stored.gameSequence === gamesPlayed + 1 ? stored : null;
}
