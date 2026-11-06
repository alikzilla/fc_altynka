import { eq } from 'drizzle-orm';
import { communities, memberships, users } from '../../src/db/schema';
import { bindCommunity, ensureMembership } from '../../src/domain/members';
import { createEvent } from '../../src/domain/events';
import type { MeDto } from '@altynka/core';
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

const groups = async (as: { id: number; first_name: string }) => ((await (await apiRequest('/api/me', { as })).json()) as MeDto).communities;

test('joining checks membership; global owner has no bypass', async () => {
  expect((await apiRequest(`/api/communities/${b}/join`, { as: w.admin, method: 'POST' })).status).toBe(403);
  expect(await groups(w.player)).toEqual([{ id: w.communityId, title: 'Футбол', role: 'player' }]);
  expect(await groups(w.admin)).toEqual([{ id: w.communityId, title: 'Футбол', role: 'admin' }]);
});

test('discovery returns only confirmed memberships and never enrolls in foreign groups', async () => {
  expect(await groups(w.player)).toEqual([{ id: w.communityId, title: 'Футбол', role: 'player' }]);
  expect(await db().select().from(memberships).where(eq(memberships.communityId, b))).toEqual([]);
});

test('object links resolve only after membership validation', async () => {
  const event = await createEvent({ db: db(), now: w.clock.now, sync: w.sync }, { communityId: b, createdBy: w.orgUserId, date: '2026-12-01', comment: null });
  expect((await apiRequest(`/api/events/${event}`, { as: w.player })).status).toBe(404);
  expect(await db().select().from(memberships).where(eq(memberships.communityId, b))).toEqual([]);
  w.tg.chatMembers.get(-100600)!.add(w.player.id);
  const r = await apiRequest(`/api/events/${event}`, { as: w.player });
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ community: { id: b } });
  expect(await groups(w.player)).toEqual([{ id: b, title: 'Другая команда', role: 'player' }, { id: w.communityId, title: 'Футбол', role: 'player' }]);
});

test('inactive team disappears from the person and refuses joins', async () => {
  const event = await createEvent({ db: db(), now: w.clock.now, sync: w.sync }, { communityId: w.communityId, createdBy: w.orgUserId, date: '2026-12-01', comment: null });
  await db().update(communities).set({ active: false }).where(eq(communities.id, w.communityId));
  expect(await groups(w.player)).toEqual([]);
  expect(await (await apiRequest('/api/events', { as: w.player })).json()).toEqual({ active: [], past: [] });
  expect((await apiRequest(`/api/events/${event}`, { as: w.player })).status).toBe(404);
  expect((await apiRequest(`/api/communities/${w.communityId}/join`, { as: w.player, method: 'POST' })).status).toBe(403);
});

test('a migrated owner who left cannot reclaim legacy privileges on ordinary rejoin', async () => {
  const [owner] = await db().select().from(users).where(eq(users.tgId, w.admin.id));
  await db().update(memberships).set({ legacy: true, telegramAdmin: false }).where(eq(memberships.userId, owner.id));
  w.tg.admins.delete(w.admin.id);
  w.tg.members.delete(w.admin.id);
  expect(await groups(w.admin)).toEqual([]);
  w.tg.members.add(w.admin.id);
  expect(await groups(w.admin)).toEqual([{ id: w.communityId, title: 'Футбол', role: 'player' }]);
});

test.each(['member', 'admin'] as const)('legacy owner migration retains the appropriate %s role only in the original team', async status => {
  const [owner] = await db().select().from(users).where(eq(users.tgId, w.admin.id));
  await db().update(memberships).set({ legacy: true, telegramAdmin: false }).where(eq(memberships.userId, owner.id));
  if (status === 'member') w.tg.admins.delete(w.admin.id);
  expect(await groups(w.admin)).toEqual([{ id: w.communityId, title: 'Футбол', role: status === 'admin' ? 'admin' : 'organizer' }]);
  await ensureMembership(db(), b, owner.id, w.clock.now);
  w.tg.chatMembers.get(-100600)!.add(w.admin.id);
  expect((await groups(w.admin)).find(g => g.id === b)).toEqual({ id: b, title: 'Другая команда', role: 'player' });
});
