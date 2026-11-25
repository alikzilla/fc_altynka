import { api } from '../src/lib/api';

vi.mock('../src/lib/tg', () => ({ initData: () => 'signed' }));

let events: string[];
const onMutation = (event: Event) => events.push((event as CustomEvent<{ path: string }>).detail.path);

beforeEach(() => {
  events = [];
  window.addEventListener('altynka:mutation', onMutation);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } })));
});
afterEach(() => { window.removeEventListener('altynka:mutation', onMutation); vi.unstubAllGlobals(); });

test('a write tells every screen to refresh', async () => {
  await api.send('POST', '/api/events/7/games/results', {});
  expect(events).toEqual(['/api/events/7/games/results']);
});

test('a write sent with refresh: false (the game timer) does not refetch the screens', async () => {
  await api.send('PUT', '/api/events/7/games/timer', { gameSequence: 1 }, { refresh: false });
  expect(fetch).toHaveBeenCalledWith('/api/events/7/games/timer', expect.objectContaining({ method: 'PUT', body: '{"gameSequence":1}' }));
  expect(events).toEqual([]);
});
