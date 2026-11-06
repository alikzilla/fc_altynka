import { and, eq } from 'drizzle-orm';
import { memberships, users } from '../../src/db/schema';
import { bindCommunity, ensureMembership } from '../../src/domain/members';
import { createEvent } from '../../src/domain/events';
import { apiRequest, db, seedUser } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
let b: number;
beforeEach(async () => {
  w = await setupApiWorld();
  b = (await bindCommunity(db(), -100600, 'Команда B')).id;
  await ensureMembership(db(), b, w.playerUserId, w.clock.now);
  w.tg.chatMembers.set(-100600, new Set([w.player.id]));
  w.tg.chatAdmins.set(-100600, new Set());
});
afterEach(teardownApiWorld);

test('players, events and role changes are confined to the selected team', async () => {
  const event = await createEvent({ db: db(), now: w.clock.now, sync: w.sync }, { communityId: b, createdBy: w.playerUserId, date: '2026-12-01', comment: null });
  expect((await apiRequest(`/api/events/${event}`, { as: w.admin, communityId: w.communityId })).status).toBe(404);
  expect((await apiRequest(`/api/events/${event}/join`, { as: w.admin, communityId: w.communityId, method: 'POST' })).status).toBe(404);
  expect((await apiRequest('/api/events', { as: w.player, communityId: b })).status).toBe(200);
  expect((await apiRequest(`/api/members/${w.orgUserId}`, { as: w.player, communityId: b, method: 'PATCH', body: { role: 'organizer' } })).status).toBe(403);
  const list = await (await apiRequest('/api/players', { as: w.player, communityId: b })).json() as { userId: number }[];
  expect(list.map(p => p.userId)).toEqual([w.playerUserId]);
});

test('a global account cannot be selected as foreign bill receiver', async () => {
  const outsider = await seedUser('Получатель B', { communityId: b });
  const event = await createEvent({ db: db(), now: w.clock.now, sync: w.sync }, { communityId: w.communityId, createdBy: w.orgUserId, date: '2026-11-06', comment: null });
  // A direct domain call must also reject another team's receiver.
  const { upsertBill } = await import('../../src/domain/bills');
  const { events } = await import('../../src/db/schema');
  await db().update(events).set({ status: 'scheduled', startTime: '00:00', durationHours: 1 }).where(eq(events.id, event));
  const result = await upsertBill({ db: db(), now: w.clock.now, sync: w.sync }, event, { receiverUserId: outsider.id, receiverKaspiPhone: '+77011234567', fieldAmount: 1000, extras: [], participantSignupIds: [999] });
  expect(result.kind).toBe('invalid');
});

test('revoked Telegram admin status removes administrative privileges immediately', async () => {
  expect((await (await apiRequest('/api/me', { as: w.admin, communityId: w.communityId })).json()) as object).toMatchObject({ role: 'admin' });
  w.tg.admins.delete(w.admin.id);
  const r = await apiRequest(`/api/members/${w.playerUserId}`, { as: w.admin, communityId: w.communityId, method: 'PATCH', body: { role: 'organizer' } });
  expect(r.status).toBe(403);
  const [m] = await db().select().from(memberships).where(and(eq(memberships.communityId, w.communityId), eq(memberships.userId, w.playerUserId)));
  expect(m.role).toBe('player');
});
