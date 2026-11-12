import type { EventDetailDto } from '@altynka/core';
import { queryClient, resourceKey } from './queryClient';
import { fetchResource } from './resource';

// Screens that load their code on demand (see App.tsx): the chunk is requested as the finger lands.
const SCREENS: [RegExp, () => Promise<unknown>][] = [
  [/^\/stats$/, () => import('../screens/Statistics')],
  [/^\/venues$/, () => import('../screens/Venues')],
  [/^\/players(\/\d+)?$/, () => import('../screens/Players')],
  [/^\/new$/, () => import('../screens/NewEvent')],
  [/^\/profile\/skills$/, () => import('../screens/SkillAssessment')],
  [/^\/event\/\d+\/review$/, () => import('../screens/MatchReview')],
  [/^\/event\/\d+\/schedule$/, () => import('../screens/Schedule')],
];

/** Starts loading what the screen behind an in-app link needs. Fresh cached data is not requested again. */
export function prefetch(href: string): void {
  let url: URL;
  try { url = new URL(href, window.location.href); } catch { return; }
  if (url.origin !== window.location.origin) return;
  const event = /^\/event\/(\d+)$/.exec(url.pathname);
  if (event) {
    const path = `/api/events/${event[1]}`;
    void queryClient.prefetchQuery({ queryKey: resourceKey(path), queryFn: ({ signal }) => fetchResource<EventDetailDto>(path, signal) });
  }
  for (const [pattern, load] of SCREENS) if (pattern.test(url.pathname)) void load().catch(() => {});
}

/** A tap takes 100–200 ms from touch to click; the request for the next screen starts at the touch. */
export function trackPrefetch(): void {
  document.addEventListener('pointerdown', event => {
    const link = (event.target as Element | null)?.closest?.('a[href]');
    const href = link?.getAttribute('href');
    if (href) prefetch(href);
  }, { capture: true, passive: true });
}
