import { flushSync } from 'react-dom';
import type { AroundNavHandler } from 'wouter';

/** Bottom sheets with their own route sit over the page underneath; opening or closing one keeps its scroll and plays no page transition. */
export const SHEET_PATH = /^\/(?:new|event\/\d+\/schedule|profile\/settings\/[^/]+|profile\/availability|players\/\d+)$/;

const ROOT_TABS = new Set(['/', '/matches', '/notifications', '/profile']);
export type NavKind = 'forward' | 'back' | 'fade';

/** Dock tabs are level 0; every other screen is as deep as its path. */
const depth = (path: string) => ROOT_TABS.has(path) ? 0 : path.split('/').filter(Boolean).length;

/** How the screen change should look; null when the screen itself does not change (same path, or a sheet opening/closing). */
export function navKind(from: string, to: string): NavKind | null {
  if (from === to || SHEET_PATH.test(from) || SHEET_PATH.test(to)) return null;
  const delta = depth(to) - depth(from);
  return delta > 0 ? 'forward' : delta < 0 ? 'back' : 'fade';
}

const scrollByPath = new Map<string, number>();
let pending: { path: string; top: number } | null = null;

/** Where the screen at `path` should be scrolled after a navigation: the remembered place on Back, the top otherwise. */
export function consumeScrollTarget(path: string): number {
  const top = pending?.path === path ? pending.top : 0;
  pending = null;
  return top;
}

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };
type TransitionKind = NavKind | 'tab-forward' | 'tab-back';
let running = 0;

/**
 * Runs `update` inside a view transition styled by `kind` (styles/transitions.css). `beforeCapture` runs only
 * when there is a transition, after the update and before the new state is captured. Without support or with
 * reduced motion the update simply happens.
 */
function transition(kind: TransitionKind, update: () => void, beforeCapture?: () => void): void {
  const doc = document as TransitionDocument;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced || document.visibilityState !== 'visible') { update(); return; }
  const root = document.documentElement;
  const id = ++running;
  root.dataset.nav = kind;
  const done = () => { if (running === id) delete root.dataset.nav; };
  try {
    doc.startViewTransition(() => {
      flushSync(update);
      beforeCapture?.();
    }).finished.then(done, done);
  } catch {
    done();
    update();
  }
}

/** Switches a tab inside a screen: only the tab panel slides, toward the side of the tab that was chosen. */
export function slideTab(direction: 'forward' | 'back', update: () => void): void {
  transition(direction === 'forward' ? 'tab-forward' : 'tab-back', update);
}

/**
 * Wraps every in-app navigation: remembers the scroll of the screen being left, restores it on Back and,
 * where the browser supports view transitions, animates the screen change.
 */
export const aroundNav: AroundNavHandler = (navigate, to, options) => {
  const from = window.location.pathname;
  const target = new URL(String(to), window.location.href).pathname;
  const kind = navKind(from, target);
  if (!kind) { navigate(to, options); return; }

  scrollByPath.set(from, window.scrollY);
  const top = kind === 'back' ? scrollByPath.get(target) ?? 0 : 0;
  pending = top ? { path: target, top } : null;
  // The new screen is captured right after the update, so it must already stand at its final scroll.
  transition(kind, () => navigate(to, options), () => window.scrollTo(0, top));
};
