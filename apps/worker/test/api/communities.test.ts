import { eq } from 'drizzle-orm';
import { communities, memberships, users } from '../../src/db/schema';
import { bindCommunity, ensureMembership } from '../../src/domain/members';
import { createEvent } from '../../src/domain/events';
import { apiRequest, db } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
let b: number;
beforeEach(async () => {
  w = await setupApiWorld();
  b = (await bindCommunity(db(), -100600, 'Другая команда')).id;
  w.tg.chatMembers.set(-100600, new Set());
  w.tg.chatAdmins.set(-100600, new Set());
});
afterEach(teardownApiWorld);

test('explicit selection checks membership; global owner has no bypass', async () => {
  const r = await apiRequest('/api/me', { as: w.admin, communityId: b });
  expect(r.status).toBe(403);
  expect((await apiRequest('/api/me', { as: w.player, communityId: w.communityId })).status).toBe(200);
  expect((await apiRequest('/api/me', { as: w.player })).status).toBe(409);
});

test('discovery returns only confirmed memberships and never enrolls in foreign groups', async () => {
  const before = await db().select().from(memberships);
  const r = await apiRequest('/api/communities', { as: w.player });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ communities: [{ id: w.communityId, title: 'Футбол' }] });
  expect(await db().select().from(memberships)).toEqual(before);
});

test('object links resolve only after membership validation', async () => {
  const event = await createEvent({ db: db(), now: w.clock.now, sync: w.sync }, { communityId: b, createdBy: w.orgUserId, date: '2026-12-01', comment: null });
  expect((await apiRequest(`/api/context?eventId=${event}`, { as: w.player })).status).toBe(403);
  await ensureMembership(db(), b, w.playerUserId, w.clock.now);
  w.tg.chatMembers.get(-100600)!.add(w.player.id);
  const r = await apiRequest(`/api/context?eventId=${event}`, { as: w.player });
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ community: { id: b } });
});

test('inactive team blocks API and context resolution', async () => {
  await db().update(communities).set({ active: false }).where(eq(communities.id, w.communityId));
  expect((await apiRequest('/api/me', { as: w.player, communityId: w.communityId })).status).toBe(403);
  expect(await (await apiRequest('/api/communities', { as: w.player })).json()).toEqual({ communities: [] });
});

test('a migrated owner who left cannot reclaim legacy privileges on ordinary rejoin', async () => {
  const [owner] = await db().select().from(users).where(eq(users.tgId, w.admin.id));
  await db().update(memberships).set({ legacy: true, telegramAdmin: false }).where(eq(memberships.userId, owner.id));
  w.tg.admins.delete(w.admin.id);
  w.tg.members.delete(w.admin.id);
  expect((await apiRequest('/api/me', { as: w.admin, communityId: w.communityId })).status).toBe(403);
  w.tg.members.add(w.admin.id);
  const response = await apiRequest('/api/me', { as: w.admin, communityId: w.communityId });
  expect(await response.json()).toMatchObject({ role: 'player' });
});

test.each(['member', 'admin'] as const)('legacy owner migration retains the appropriate %s role only in the original team', async status => {
  const [owner] = await db().select().from(users).where(eq(users.tgId, w.admin.id));
  await db().update(memberships).set({ legacy: true, telegramAdmin: false }).where(eq(memberships.userId, owner.id));
  if (status === 'member') w.tg.admins.delete(w.admin.id);
  const response = await apiRequest('/api/me', { as: w.admin, communityId: w.communityId });
  expect(await response.json()).toMatchObject({ role: status === 'admin' ? 'admin' : 'organizer' });
  await ensureMembership(db(), b, owner.id, w.clock.now);
  w.tg.chatMembers.get(-100600)!.add(w.admin.id);
  expect(await (await apiRequest('/api/me', { as: w.admin, communityId: b })).json()).toMatchObject({ role: 'player' });
});
