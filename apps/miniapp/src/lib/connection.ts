import { useSyncExternalStore } from 'react';

/**
 * Whether the server can be reached. The browser's online flag alone is not enough: on a weak signal it often
 * says «online» while every request fails, so a request that never got an answer also counts, until one does.
 */
let browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
let requestFailed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export const isOffline = () => browserOffline || requestFailed;

/** Called by the API client: `false` when a request got no answer at all, `true` for any answer, errors included. */
export function reportReachable(reachable: boolean): void {
  if (requestFailed !== reachable) return;
  requestFailed = !reachable;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const useOffline = () => useSyncExternalStore(subscribe, isOffline, () => false);

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => { browserOffline = true; emit(); });
  window.addEventListener('online', () => { browserOffline = false; emit(); });
}

export function resetConnectionForTests(): void {
  browserOffline = false;
  requestFailed = false;
  emit();
}
