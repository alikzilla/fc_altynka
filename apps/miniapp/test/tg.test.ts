import { render } from '@testing-library/react';
import { createElement } from 'react';
import { ready, useBackButton, requestWriteAccess, openTelegramLink } from '../src/lib/tg';
import { api } from '../src/lib/api';
import { applyTheme, initializeTheme } from '../src/lib/theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = '';
});

afterEach(() => {
  Reflect.deleteProperty(window, 'Telegram');
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

test('Telegram native surfaces follow chosen app theme and never adopt the host theme', () => {
  const listeners = new Map<string, () => void>();
  const colors: Record<string, string> = {};
  const app = {
    ready() {}, expand() {}, colorScheme: 'dark', isVersionAtLeast: () => true,
    setHeaderColor: (color: string) => { colors.header = color; },
    setBackgroundColor: (color: string) => { colors.background = color; },
    setBottomBarColor: (color: string) => { colors.bottom = color; },
    onEvent: (name: string, callback: () => void) => listeners.set(name, callback),
    offEvent: (name: string) => listeners.delete(name),
  };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: app } });
  initializeTheme();
  applyTheme('light');
  const cleanup = ready();
  expect(colors).toEqual({ header: '#f4f2f7', background: '#f4f2f7', bottom: '#f4f2f7' });
  listeners.get('themeChanged')?.();
  expect(document.documentElement.dataset.theme).toBe('light');
  applyTheme('dark');
  expect(colors).toEqual({ header: '#08090b', background: '#08090b', bottom: '#08090b' });
  cleanup();
  expect(listeners.size).toBe(0);
  applyTheme('light');
  expect(colors).toEqual({ header: '#08090b', background: '#08090b', bottom: '#08090b' });
});

test.each([true, false])('write access adapter reports native permission result %s', async granted => {
  const app = { isVersionAtLeast: (v: string) => v === '6.9', requestWriteAccess: (callback: (granted: boolean) => void) => callback(granted) };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: app } });
  expect(await requestWriteAccess()).toBe(granted);
});

test('write access adapter safely reports unsupported clients and native failure', async () => {
  expect(await requestWriteAccess()).toBeNull();
  const app = { isVersionAtLeast: () => false, requestWriteAccess: () => { throw new Error('unsupported'); } };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: app } });
  expect(await requestWriteAccess()).toBeNull();
  app.isVersionAtLeast = () => true;
  expect(await requestWriteAccess()).toBeNull();
});

test('bot settings uses the native Telegram link handler instead of an external browser', () => {
  const opened: string[] = [];
  const app = { openTelegramLink: (url: string) => opened.push(url), openLink: () => { throw new Error('external browser'); } };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: app } });
  openTelegramLink('https://t.me/fc_altynka_bot?start=settings');
  expect(opened).toEqual(['https://t.me/fc_altynka_bot?start=settings']);
});

test('API authorization reads fresh signed initData after permission changes', async () => {
  const app = { initData: 'before', isVersionAtLeast: () => true, requestWriteAccess: (callback: (granted: boolean) => void) => { app.initData = 'after'; callback(true); } };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: app } });
  const authorizations: string[] = [];
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    authorizations.push((init.headers as Record<string, string>).Authorization);
    return new Response('{}');
  });
  await api.get('/api/me');
  await requestWriteAccess();
  await api.send('PATCH', '/api/me', { notificationsEnabled: true });
  expect(authorizations).toEqual(['tma before', 'tma after']);
});

test('approved dark design stays dark when Telegram switches to its light theme', () => {
  const listeners = new Map<string, () => void>();
  const app = {
    colorScheme: 'dark', ready: vi.fn(), expand: vi.fn(),
    onEvent: vi.fn((name: string, listener: () => void) => listeners.set(name, listener)),
    offEvent: vi.fn((name: string) => listeners.delete(name)),
  };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: app } });
  const cleanup = ready();
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(app.ready).toHaveBeenCalledOnce();
  expect(app.expand).toHaveBeenCalledOnce();
  app.colorScheme = 'light';
  listeners.get('themeChanged')?.();
  expect(document.documentElement.dataset.theme).toBe('dark');
  cleanup();
  expect(listeners.size).toBe(0);
});

test('browser preview does not need the Telegram SDK to initialize', () => {
  expect(() => ready()()).not.toThrow();
});

test('older Telegram clients initialize without invoking unsupported native colour methods', () => {
  const app = {
    ready: vi.fn(), expand: vi.fn(), isVersionAtLeast: (version: string) => version === '6.1',
    setHeaderColor: () => { throw new Error('Custom header requires 6.9'); },
    setBackgroundColor: vi.fn(),
    setBottomBarColor: () => { throw new Error('Bottom bar requires 7.10'); },
    disableVerticalSwipes: () => { throw new Error('Vertical swipe control requires 7.7'); },
  };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: app } });
  expect(() => ready()()).not.toThrow();
  expect(app.ready).toHaveBeenCalledOnce();
  expect(document.documentElement.dataset.theme).toBe('dark');
});

test('closing a sheet restores the background Telegram back handler', () => {
  const handlers = new Set<() => void>();
  const back = { show: vi.fn(), hide: vi.fn(), onClick: (fn: () => void) => handlers.add(fn), offClick: (fn: () => void) => handlers.delete(fn) };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: { BackButton: back } } });
  const pageBack = vi.fn();
  const sheetBack = vi.fn();
  function Owner({ callback }: { callback: () => void }) { useBackButton(callback); return null; }
  const page = render(createElement(Owner, { callback: pageBack }));
  const sheet = render(createElement(Owner, { callback: sheetBack }));
  expect(handlers.size).toBe(1);
  handlers.forEach(fn => fn());
  expect(sheetBack).toHaveBeenCalledOnce();
  expect(pageBack).not.toHaveBeenCalled();
  sheet.unmount();
  handlers.forEach(fn => fn());
  expect(pageBack).toHaveBeenCalledOnce();
  page.unmount();
  expect(handlers.size).toBe(0);
});

test('startup disables Telegram minimize swipes for the whole app lifetime, including effect remounts', () => {
  const app = { ready: vi.fn(), expand: vi.fn(), isVersionAtLeast: () => true, disableVerticalSwipes: vi.fn(), enableVerticalSwipes: vi.fn() };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: app } });
  const cleanup = ready();
  expect(app.disableVerticalSwipes).toHaveBeenCalledOnce();
  expect(app.expand).toHaveBeenCalledOnce();
  expect(app.enableVerticalSwipes).not.toHaveBeenCalled();
  cleanup();
  ready()();
  expect(app.disableVerticalSwipes).toHaveBeenCalledTimes(2);
  expect(app.enableVerticalSwipes).not.toHaveBeenCalled();
});
