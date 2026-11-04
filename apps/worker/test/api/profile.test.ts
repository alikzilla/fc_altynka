import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema';
import { apiRequest, db } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);
const get = async () => (await apiRequest('/api/me', { as: w.player })).json();
const patch = (body: unknown) => apiRequest('/api/me', { as: w.player, method: 'PATCH', body });

test('setup completion is explicit and remains complete across later phone clearing', async () => {
  expect(await get()).toMatchObject({ profileCompleted: false, playingPosition: null, dominantFoot: null });
  const saved = await patch({ displayName: 'Игрок', kaspiPhone: '8 707 123 45 67', profileCompleted: true });
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({ profileCompleted: true, kaspiPhone: '+77071234567' });
  await patch({ kaspiPhone: null });
  expect(await get()).toMatchObject({ profileCompleted: true, kaspiPhone: null });
});
test('a player may complete initial setup without a payment receiver phone', async () => {
  expect(await (await patch({ displayName: 'Игрок', profileCompleted: true })).json()).toMatchObject({ profileCompleted: true, kaspiPhone: null });
  expect((await patch({ profileCompleted: false })).status).toBe(400);
});
test('football choices persist independently without completing setup or changing role', async () => {
  expect((await patch({ playingPosition: 'goalkeeper', dominantFoot: 'left' })).status).toBe(200);
  expect(await get()).toMatchObject({ playingPosition: 'goalkeeper', dominantFoot: 'left', profileCompleted: false, role: 'player' });
  await patch({ dominantFoot: 'both' });
  expect(await get()).toMatchObject({ playingPosition: 'goalkeeper', dominantFoot: 'both' });
  await patch({ playingPosition: null, dominantFoot: null });
  expect(await get()).toMatchObject({ playingPosition: null, dominantFoot: null });
});
test.each([{ playingPosition: 'coach' }, { dominantFoot: 'magic' }, { playingPosition: ['goalkeeper'] }, { dominantFoot: 5 }])('rejects invalid football data %j', async body => {
  expect((await patch(body)).status).toBe(400);
  expect(await get()).toMatchObject({ playingPosition: null, dominantFoot: null, role: 'player' });
});
test('invalid phone does not finish setup or save football changes', async () => {
  expect((await patch({ profileCompleted: true, kaspiPhone: 'abc', playingPosition: 'forward' })).status).toBe(400);
  expect(await get()).toMatchObject({ profileCompleted: false, playingPosition: null });
});
test('existing saved phone is recognized and notification-only edits do not complete empty profiles', async () => {
  await db().update(users).set({ kaspiPhone: '+77071234567' }).where(eq(users.id, w.playerUserId));
  expect(await get()).toMatchObject({ profileCompleted: true });
  await db().update(users).set({ kaspiPhone: null }).where(eq(users.id, w.playerUserId));
  await patch({ notificationsEnabled: false });
  expect(await get()).toMatchObject({ profileCompleted: false });
});
test('a profile edit cannot target another user', async () => {
  await patch({ userId: w.orgUserId, playingPosition: 'defender', dominantFoot: 'right' });
  const mine = await get();
  expect(mine).toMatchObject({ userId: w.playerUserId, playingPosition: 'defender' });
  expect(await (await apiRequest('/api/me', { as: w.org })).json()).toMatchObject({ playingPosition: null, dominantFoot: null });
});

test('clearing a legacy phone does not reopen setup when its completion timestamp was not backfilled', async () => {
  await db().update(users).set({ kaspiPhone: '+77071234567', profileCompletedAt: null }).where(eq(users.id, w.playerUserId));
  expect(await get()).toMatchObject({ profileCompleted: true });
  expect((await patch({ kaspiPhone: null })).status).toBe(200);
  expect(await get()).toMatchObject({ profileCompleted: true, kaspiPhone: null });
});
