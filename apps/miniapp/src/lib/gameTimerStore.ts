import { GAME_TIMER_DEFAULT_SEC, GAME_TIMER_MAX_SEC, GAME_TIMER_MIN_SEC, type StoredGameTimer } from '@altynka/core';

const timerKey = (eventId: number) => `altynka:game-timer:${eventId}`;
const DURATION_KEY = 'altynka:game-timer-duration';

export function readPendingTimer(eventId: number): StoredGameTimer | null {
  try {
    const value = JSON.parse(localStorage.getItem(timerKey(eventId)) ?? 'null');
    return value && typeof value === 'object' ? value as StoredGameTimer : null;
  } catch { return null; }
}
export function writePendingTimer(eventId: number, timer: StoredGameTimer): void {
  try { localStorage.setItem(timerKey(eventId), JSON.stringify(timer)); } catch { /* Storage may be unavailable in a WebView. */ }
}
export function clearPendingTimer(eventId: number): void {
  try { localStorage.removeItem(timerKey(eventId)); } catch { /* Nothing to clear without storage. */ }
}

export function readTimerDuration(): number {
  try {
    const sec = Number(localStorage.getItem(DURATION_KEY));
    return Number.isInteger(sec) && sec >= GAME_TIMER_MIN_SEC && sec <= GAME_TIMER_MAX_SEC && sec % 60 === 0 ? sec : GAME_TIMER_DEFAULT_SEC;
  } catch { return GAME_TIMER_DEFAULT_SEC; }
}
export function writeTimerDuration(sec: number): void {
  try { localStorage.setItem(DURATION_KEY, String(sec)); } catch { /* The duration falls back to the default. */ }
}
