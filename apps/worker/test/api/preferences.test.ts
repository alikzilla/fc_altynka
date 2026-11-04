import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema';
import { apiRequest, db } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);
test('personal notifications default off; unsigned client reachability cannot enable them', async () => {
  expect(await (await apiRequest('/api/me', { as: w.player })).json()).toMatchObject({ notifications: { enabled: false, available: false } });
  const response = await apiRequest('/api/me', { as: w.player, method: 'PATCH', body: { notificationsEnabled: true, pmAvailable: true } });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: 'write_access_required' });
});
test('signed Telegram write permission proves availability but does not subscribe by itself', async () => {
  const as = { ...w.player, allows_write_to_pm: true };
  expect(await (await apiRequest('/api/me', { as })).json()).toMatchObject({ notifications: { enabled: false, available: true } });
  expect(await (await apiRequest('/api/me', { as, method: 'PATCH', body: { notificationsEnabled: true } })).json()).toMatchObject({ notifications: { enabled: true, available: true } });
  await apiRequest('/api/me', { as: w.player, method: 'PATCH', body: { notificationsEnabled: false } });
  expect((await db().select().from(users).where(eq(users.id, w.playerUserId)))[0].notificationsEnabled).toBe(false);
});
