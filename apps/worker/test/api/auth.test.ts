import { setDepsFactoryForTests } from '../../src/api/routes';
import { getDb } from '../../src/db/client';
import { apiRequest } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);

test('401 without initData; anyone else enters, a chat member joins as player', async () => {
  expect((await apiRequest('/api/me', { as: null })).status).toBe(401);
  const stranger = { id: 77, first_name: 'Чужой' };
  const r1 = await apiRequest('/api/me', { as: stranger });
  expect(r1.status).toBe(200);
  expect(await r1.json()).toMatchObject({ displayName: 'Чужой', communities: [], kaspiPhone: null });
  expect((await apiRequest(`/api/communities/${w.communityId}/join`, { as: stranger, method: 'POST' })).status).toBe(403);
  w.tg.members.add(77);
  expect((await apiRequest(`/api/communities/${w.communityId}/join`, { as: stranger, method: 'POST' })).status).toBe(200);
  const r2 = await apiRequest('/api/me', { as: stranger });
  expect(r2.status).toBe(200);
  expect(await r2.json()).toMatchObject({ displayName: 'Чужой', communities: [{ id: w.communityId, role: 'player' }], kaspiPhone: null });
});

test('admin is recognised by confirmed Telegram status', async () => {
  expect(await (await apiRequest('/api/me', { as: w.admin })).json()).toMatchObject({ communities: [{ id: w.communityId, role: 'admin' }] });
});

test('health check needs no auth', async () => {
  const r = await apiRequest('/api/health', { as: null });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
});

test('membership is re-checked immediately and dropped once the user left the group', async () => {
  const stranger = { id: 77, first_name: 'Чужой' };
  const groups = async (at?: number) => ((await (await apiRequest('/api/me', { as: stranger, at })).json()) as { communities: { id: number }[] }).communities.map(g => g.id);
  w.tg.members.add(77);
  expect((await apiRequest(`/api/communities/${w.communityId}/join`, { as: stranger, method: 'POST' })).status).toBe(200);
  expect(await groups()).toEqual([w.communityId]);
  w.tg.members.delete(77);
  expect(await groups()).toEqual([]);
  expect((await apiRequest('/api/events', { as: stranger })).status).toBe(200);
  expect(await (await apiRequest('/api/events', { as: stranger })).json()).toEqual({ active: [], past: [] });
  const later = Date.now() + 25 * 3600_000;
  setDepsFactoryForTests(env => ({ db: getDb(env.DB), now: later, sync: w.sync }));
  expect(await groups(later)).toEqual([]);
  w.tg.members.add(77);
  expect(await groups(later)).toEqual([w.communityId]);
});
