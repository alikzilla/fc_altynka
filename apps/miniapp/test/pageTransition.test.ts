import { afterEach, describe, expect, it, vi } from 'vitest';
import { aroundNav, consumeScrollTarget, hasDock, navKind } from '../src/lib/pageTransition';

describe('navKind', () => {
  it('moves forward into deeper screens and back out of them', () => {
    expect(navKind('/matches', '/event/5')).toBe('forward');
    expect(navKind('/event/5', '/event/5/review')).toBe('forward');
    expect(navKind('/', '/stats')).toBe('forward');
    expect(navKind('/event/5', '/matches')).toBe('back');
    expect(navKind('/profile/skills', '/profile')).toBe('back');
  });

  it('cross-fades dock tabs in place', () => {
    expect(navKind('/', '/matches')).toBe('fade');
    expect(navKind('/notifications', '/profile')).toBe('fade');
  });

  it('leaves sheets and same-screen changes alone', () => {
    expect(navKind('/matches', '/new')).toBeNull();
    expect(navKind('/event/5/schedule', '/event/5')).toBeNull();
    expect(navKind('/players', '/players/7')).toBeNull();
    expect(navKind('/profile', '/profile/settings/name')).toBeNull();
    expect(navKind('/profile', '/profile/availability')).toBeNull();
    expect(navKind('/profile', '/profile/club')).toBeNull();
    expect(navKind('/profile/club', '/profile')).toBeNull();
    expect(navKind('/event/5', '/event/5')).toBeNull();
  });
});

describe('hasDock', () => {
  it('keeps the dock on the tabs, one step from them and on the sheets over those screens', () => {
    for (const path of ['/', '/matches', '/notifications', '/profile', '/profile/club', '/profile/availability', '/profile/settings/name',
      '/event/5', '/event/5/schedule', '/stats', '/players', '/players/7', '/venues']) {
      expect(hasDock(path), path).toBe(true);
    }
  });

  it('hides it on the deeper task screens', () => {
    for (const path of ['/event/5/game', '/event/5/review', '/profile/skills']) {
      expect(hasDock(path), path).toBe(false);
    }
  });
});

describe('aroundNav scroll memory', () => {
  afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
  const go = (to: string) => aroundNav(path => window.history.pushState(null, '', String(path)), to, undefined);

  it('restores the list position on Back and starts other screens at the top', () => {
    window.history.replaceState(null, '', '/matches');
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(640);
    go('/event/5?tab=bill');
    expect(window.location.pathname).toBe('/event/5');
    expect(consumeScrollTarget('/event/5')).toBe(0);

    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(120);
    go('/matches');
    expect(consumeScrollTarget('/matches')).toBe(640);
    // Consumed once: a later visit by another route starts at the top.
    expect(consumeScrollTarget('/matches')).toBe(0);
  });

  it('does not restore when the list is opened as a tab', () => {
    window.history.replaceState(null, '', '/matches');
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(500);
    go('/');
    go('/matches');
    expect(consumeScrollTarget('/matches')).toBe(0);
  });
});
