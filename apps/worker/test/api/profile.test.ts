import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema';
import { setMemberProfile, localUser, apiRequest, db } from '../helpers';
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
  expect(await get()).toMatchObject({ playingPosition: 'goalkeeper', dominantFoot: 'left', profileCompleted: false, communities: [{ role: 'player' }] });
  await patch({ dominantFoot: 'both' });
  expect(await get()).toMatchObject({ playingPosition: 'goalkeeper', dominantFoot: 'both' });
  await patch({ playingPosition: null, dominantFoot: null });
  expect(await get()).toMatchObject({ playingPosition: null, dominantFoot: null });
});
test.each([{ playingPosition: 'coach' }, { dominantFoot: 'magic' }, { playingPosition: ['goalkeeper'] }, { dominantFoot: 5 }])('rejects invalid football data %j', async body => {
  expect((await patch(body)).status).toBe(400);
  expect(await get()).toMatchObject({ playingPosition: null, dominantFoot: null, communities: [{ role: 'player' }] });
});
test('invalid phone does not finish setup or save football changes', async () => {
  expect((await patch({ profileCompleted: true, kaspiPhone: 'abc', playingPosition: 'forward' })).status).toBe(400);
  expect(await get()).toMatchObject({ profileCompleted: false, playingPosition: null });
});
test('existing saved phone is recognized and notification-only edits do not complete empty profiles', async () => {
  await setMemberProfile(w.playerUserId, { kaspiPhone: '+77071234567' });
  expect(await get()).toMatchObject({ profileCompleted: true });
  await setMemberProfile(w.playerUserId, { kaspiPhone: null });
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
  await setMemberProfile(w.playerUserId, { kaspiPhone: '+77071234567', profileCompletedAt: null });
  expect(await get()).toMatchObject({ profileCompleted: true });
  expect((await patch({ kaspiPhone: null })).status).toBe(200);
  expect(await get()).toMatchObject({ profileCompleted: true, kaspiPhone: null });
});
test('pinned achievement persists, clears and rejects unknown ids', async () => {
  expect(await get()).toMatchObject({ pinnedAchievement: null });
  expect((await patch({ pinnedAchievement: 'scorer' })).status).toBe(200);
  expect(await get()).toMatchObject({ pinnedAchievement: 'scorer' });
  expect((await patch({ pinnedAchievement: 'sniper' })).status).toBe(400);
  expect(await get()).toMatchObject({ pinnedAchievement: 'scorer' });
  await patch({ pinnedAchievement: null });
  expect(await get()).toMatchObject({ pinnedAchievement: null });
});
