import { TgForbidden } from '../../src/telegram/client';
import { apiRequest } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);

const send = (body: unknown = { text: 'Кнопка «Иду» не нажимается <script>', path: '/event/7', version: 'a1b2c3d' }, at?: number) =>
  apiRequest('/api/feedback', { as: { ...w.player, username: 'igrok_tg' } as never, method: 'POST', body, at });

test('a report reaches the admin with who sent it, their groups, the screen and the version', async () => {
  const r = await send();
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ sent: true });
  expect(w.tg.sent).toHaveLength(1);
  const { chatId, html } = w.tg.sent[0];
  expect(chatId).toBe(42);
  expect(html).toContain('<a href="tg://user?id=2002">Игрок</a> (@igrok_tg)');
  expect(html).toContain(`id ${w.playerUserId}`);
  expect(html).toContain('Группы: ');
  expect(html).toContain('<code>/event/7</code> · версия <code>a1b2c3d</code>');
  expect(html).toContain('<blockquote>Кнопка «Иду» не нажимается &lt;script&gt;</blockquote>');
});

test('one report per 30 seconds per person', async () => {
  const t = Date.now();
  expect((await send(undefined, t)).status).toBe(200);
  const again = await send(undefined, t);
  expect(again.status).toBe(429);
  expect(await again.json()).toEqual({ error: 'too_often' });
  expect(w.tg.sent).toHaveLength(1);
});

test('an empty or oversized report is refused; a refused delivery can be retried at once', async () => {
  expect((await send({ text: '   ', path: '/', version: 'x' })).status).toBe(400);
  expect((await send({ text: 'x'.repeat(1001), path: '/', version: 'x' })).status).toBe(400);
  w.tg.failNextWith = new TgForbidden('bot was blocked by the user');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const failed = await send();
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ error: 'not_sent' });
  expect((await send()).status).toBe(200);
});
