import { render, screen, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { App } from '../src/App';
import { startParam } from '../src/lib/tg';

vi.mock('../src/lib/tg');

const me = { userId: 1, displayName: 'Игрок', kaspiPhone: null, communities: [] as unknown[] };
let calls: { method: string; path: string }[];
let meStatus: number;

beforeEach(() => {
  calls = [];
  meStatus = 200;
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', path });
    if (path === '/api/me') return meStatus === 200 ? Response.json(me) : Response.json({ error: 'x' }, { status: meStatus });
    if (path === '/api/communities/7/join') return Response.json({ community: { id: 7, title: 'Альфа' } });
    if (path === '/api/notifications') return Response.json({ tasks: [] });
    if (path === '/api/events') return Response.json({ active: [], past: [] });
    if (path.startsWith('/api/matches')) return Response.json({ events: [], nextCursor: null });
    throw new Error(`Unexpected ${path}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const open = () => {
  const loc = memoryLocation({ path: '/', record: true });
  render(<Router hook={loc.hook} searchHook={loc.searchHook}><App /></Router>);
  return loc;
};

test('a c{id}_ start param joins that group once, then refetches /api/me', async () => {
  (startParam as Mock).mockReturnValue('c7_matches');
  const loc = open();
  await waitFor(() => {
    const join = calls.findIndex(c => c.method === 'POST' && c.path === '/api/communities/7/join');
    expect(join).toBeGreaterThanOrEqual(0);
    expect(calls.slice(join + 1).some(c => c.method === 'GET' && c.path === '/api/me')).toBe(true);
  });
  expect(calls.filter(c => c.path === '/api/communities/7/join')).toHaveLength(1);
  expect(loc.history.at(-1)).toBe('/matches');
});

test('/api/me errors only explain the two possible causes', async () => {
  (startParam as Mock).mockReturnValue(undefined);
  meStatus = 403;
  open();
  expect(await screen.findByText('Нет связи, попробуй позже')).toBeInTheDocument();
  expect(screen.queryByText('Мини-апп доступен только участникам группы')).toBeNull();
});

test('/api/me 401 asks to open the app from Telegram', async () => {
  (startParam as Mock).mockReturnValue(undefined);
  meStatus = 401;
  open();
  expect(await screen.findByText('Открой мини-апп из Telegram')).toBeInTheDocument();
});
