import { setDepsFactoryForTests } from '../../src/api/routes';
import { getDb } from '../../src/db/client';
import { apiRequest } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);

test('401 without initData, 403 for non-member, member is auto-registered as player', async () => {
  expect((await apiRequest('/api/me', { as: null })).status).toBe(401);
  const stranger = { id: 77, first_name: 'Чужой' };
  const r1 = await apiRequest('/api/me', { as: stranger });
  expect(r1.status).toBe(403);
  expect(await r1.json()).toEqual({ error: 'not_member' });
  w.tg.members.add(77);
  const r2 = await apiRequest('/api/me', { as: stranger });
  expect(r2.status).toBe(200);
  expect(await r2.json()).toMatchObject({ displayName: 'Чужой', role: 'player', kaspiPhone: null });
});

test('admin is recognised by ADMIN_TG_ID', async () => {
  expect(await (await apiRequest('/api/me', { as: w.admin })).json()).toMatchObject({ role: 'admin' });
});

test('health check needs no auth', async () => {
  const r = await apiRequest('/api/health', { as: null });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
});

test('membership is re-checked after a day and refused once the user left the group', async () => {
  const stranger = { id: 77, first_name: 'Чужой' };
  w.tg.members.add(77);
  expect((await apiRequest('/api/me', { as: stranger })).status).toBe(200);
  w.tg.members.delete(77);
  expect((await apiRequest('/api/me', { as: stranger })).status).toBe(200);
  const later = Date.now() + 25 * 3600_000;
  setDepsFactoryForTests(env => ({ db: getDb(env.DB), now: later, sync: w.sync }));
  expect((await apiRequest('/api/me', { as: stranger, at: later })).status).toBe(403);
  w.tg.members.add(77);
  expect((await apiRequest('/api/me', { as: stranger, at: later })).status).toBe(200);
});
