import { clubById } from '@altynka/core';
import { clubVariables } from '../src/lib/clubTheme';
import { applyClub, applyTheme, getClubId, getTheme, initializeTheme } from '../src/lib/theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = '';
});
afterEach(() => vi.restoreAllMocks());

test('first visit defaults to dark and sets native form color scheme', () => {
  initializeTheme();
  expect(getTheme()).toBe('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(document.documentElement.style.colorScheme).toBe('dark');
});

test('cached light preference paints before account hydration', () => {
  localStorage.setItem('altynka:theme', 'light');
  initializeTheme();
  expect(getTheme()).toBe('light');
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(document.documentElement.style.colorScheme).toBe('light');
});

test('accepted account preference replaces the cache and notifies native bridge consumers', () => {
  localStorage.setItem('altynka:theme', 'dark');
  initializeTheme();
  const observed: string[] = [];
  const listener = () => observed.push(getTheme());
  window.addEventListener('altynka:theme', listener);
  try {
    applyTheme('light');
    expect(getTheme()).toBe('light');
    expect(localStorage.getItem('altynka:theme')).toBe('light');
    expect(observed).toEqual(['light']);
    applyTheme('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(observed).toEqual(['light', 'dark']);
  } finally {
    window.removeEventListener('altynka:theme', listener);
  }
});

test('malformed cached preference never becomes a document theme', () => {
  localStorage.setItem('altynka:theme', 'system');
  initializeTheme();
  expect(getTheme()).toBe('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
});

test('denied storage reads and writes do not prevent choosing a theme', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied'); });
  expect(() => initializeTheme()).not.toThrow();
  expect(() => applyTheme('light')).not.toThrow();
  expect(getTheme()).toBe('light');
  expect(document.documentElement.style.colorScheme).toBe('light');
});

describe('club theme', () => {
  const root = document.documentElement;
  beforeEach(() => { delete root.dataset.club; root.removeAttribute('style'); });

  test('cached club paints before account hydration', () => {
    localStorage.setItem('altynka:club', 'barcelona');
    initializeTheme();
    expect(root.dataset.club).toBe('barcelona');
    expect(root.style.getPropertyValue('--accent')).toBe(clubById('barcelona')!.dark.accent);
  });

  test('switching to light recomputes club variables', () => {
    applyTheme('dark');
    applyClub('barcelona');
    applyTheme('light');
    expect(root.style.getPropertyValue('--accent')).toBe(clubById('barcelona')!.light.accent);
  });

  test('unknown cached club starts without a club', () => {
    localStorage.setItem('altynka:club', 'dinamo-zagreb');
    initializeTheme();
    expect(root.dataset.club).toBeUndefined();
    expect(root.style.getPropertyValue('--accent')).toBe('');
  });

  test('clearing the club removes every variable', () => {
    applyClub('barcelona');
    expect(getClubId()).toBe('barcelona');
    applyClub(null);
    expect(root.dataset.club).toBeUndefined();
    expect(root.style.getPropertyValue('--accent')).toBe('');
    for (const name of Object.keys(clubVariables(clubById('barcelona')!, 'dark'))) expect(root.style.getPropertyValue(name), name).toBe('');
    expect(Array.from({ length: root.style.length }, (_, i) => root.style.item(i)).filter(name => name.startsWith('--'))).toEqual([]);
    expect(localStorage.getItem('altynka:club')).toBeNull();
  });

  test('applyClub notifies listeners', () => {
    const listener = vi.fn();
    window.addEventListener('altynka:theme', listener);
    applyClub('barcelona');
    window.removeEventListener('altynka:theme', listener);
    expect(listener).toHaveBeenCalled();
  });
});
