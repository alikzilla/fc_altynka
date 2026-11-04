import { applyTheme, getTheme, initializeTheme } from '../src/lib/theme';

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
