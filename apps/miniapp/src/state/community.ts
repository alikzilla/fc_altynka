import { useSyncExternalStore } from 'react';

let selected: number | null = null;
let version = 0;
const listeners = new Set<() => void>();
export const getCommunityId = () => selected;
export const getCommunityVersion = () => version;
export function setCommunityId(id: number | null): void {
  if (id === selected) return;
  selected = id;
  version++;
  listeners.forEach(notify => notify());
}
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
export const useCommunityId = () => useSyncExternalStore(subscribe, getCommunityId);
