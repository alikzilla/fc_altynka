import type { EventDetailDto } from '@altynka/core';
import { eq } from 'drizzle-orm';
import { bills, communities, events, signups, users } from '../../src/db/schema';
import { apiRequest as rawRequest, db } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
const apiRequest = (path: string, options: Parameters<typeof rawRequest>[1]) => rawRequest(path, { ...options, at: w.clock.now });
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);
const create = (body: unknown) => apiRequest('/api/events', { method: 'POST', as: w.org, body });
const post = (path: string, body?: unknown) => apiRequest(path, { method: 'POST', as: w.org, body });

test('legacy: a bill requires appointment; rejected requests leave signup, phone and bills unchanged', async () => {
  const { id } = await (await create({ date: '2026-11-07', communityId: w.communityId })).json() as { id: number };
  await db().update(events).set({ protocolVersion: 0 }).where(eq(events.id, id));
  await post(`/api/events/${id}/join`);
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.player });
  const detail = await (await apiRequest(`/api/events/${id}`, { as: w.org })).json() as EventDetailDto;
  const body = { receiverUserId: w.orgUserId, receiverKaspiPhone: '87071234567', fieldAmount: 4000, extras: [], participantSignupIds: detail.main.map(s => s.id) };
  const put = () => apiRequest(`/api/events/${id}/bill`, { method: 'PUT', as: w.org, body });
  const rejected = await put();
  expect(rejected.status).toBe(409);
  expect(await rejected.json()).toEqual({ error: 'not_scheduled' });
  expect(await db().select().from(bills)).toHaveLength(0);
  expect((await db().select().from(users).where(eq(users.id, w.orgUserId)))[0].kaspiPhone).toBeNull();
  expect((await db().select().from(events).where(eq(events.id, id)))[0].status).toBe('collecting');
  expect((await post(`/api/events/${id}/schedule`, { startTime: '21:00', durationHours: 1 })).status).toBe(200);
  const early = await put();
  expect(early.status).toBe(409);
  expect(await early.json()).toEqual({ error: 'not_started' });
  w.clock.now = Date.parse('2026-11-07T16:00:00Z');
  w.tg.members.add(w.org.id); w.tg.members.add(w.player.id);
  expect((await post(`/api/events/${id}/join`)).status).toBe(409);
  expect((await post(`/api/events/${id}/leave`)).status).toBe(409);
  expect((await post(`/api/events/${id}/guests`, { name: 'Друг' })).status).toBe(409);
  expect((await put()).status).toBe(200);
  expect((await post(`/api/events/${id}/schedule`, { startTime: '22:00', durationHours: 2 })).status).toBe(409);
  expect((await post(`/api/events/${id}/cancel`)).status).toBe(409);
});

test('me exposes the real groups and create rejects a foreign or missing destination', async () => {
  expect(await (await apiRequest('/api/me', { as: w.org })).json()).toMatchObject({ communities: [{ id: w.communityId, title: 'Футбол', role: 'organizer' }] });
  expect((await create({ date: '2026-11-07', communityId: w.communityId + 1 })).status).toBe(403);
  expect((await create({ date: '2026-11-07' })).status).toBe(400);
  expect(await db().select().from(events)).toHaveLength(0);
  expect((await create({ date: '2026-11-07', communityId: w.communityId, comment: '  Футболки  ' })).status).toBe(200);
});

test.each(['2026-02-30', '2026-13-01', '2026-11-00', '2000-01-01'])('create rejects invalid or past date %s', async date => {
  expect((await create({ date, communityId: w.communityId })).status).toBe(400);
  expect(await db().select().from(events)).toHaveLength(0);
});

test('organizer cannot delete another community signup by guessing its id', async () => {
  const [community] = await db().insert(communities).values({ tgChatId: -100123, title: 'Другая' }).returning();
  // Nobody of this world is in that chat (FakeTg would otherwise fall back to the default member set).
  w.tg.chatMembers.set(-100123, new Set()); w.tg.chatAdmins.set(-100123, new Set());
  const [event] = await db().insert(events).values({ communityId: community.id, date: '2026-11-07', createdBy: w.orgUserId, createdAt: 0 }).returning();
  const [signup] = await db().insert(signups).values({ eventId: event.id, userId: w.playerUserId, seq: 1, createdAt: 0 }).returning();
  expect((await apiRequest(`/api/signups/${signup.id}`, { method: 'DELETE', as: w.org })).status).toBe(404);
  expect(await db().select().from(signups).where(eq(signups.id, signup.id))).toHaveLength(1);
});
