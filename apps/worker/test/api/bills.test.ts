import type { BillDto, EventDetailDto } from '@altynka/core';
import { apiRequest as rawRequest, db } from '../helpers';
import { eq } from 'drizzle-orm';
import { events } from '../../src/db/schema';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
const apiRequest = (path: string, options: Parameters<typeof rawRequest>[1]) => rawRequest(path, { ...options, at: w.clock.now });
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);

test('PUT bill validates amounts, creates bill visible in detail; player pays via API', async () => {
  const { id } = (await (await apiRequest('/api/events', { method: 'POST', as: w.org, body: { date: '2026-11-07', communityId: w.communityId } })).json()) as { id: number };
  await db().update(events).set({protocolVersion:0}).where(eq(events.id,id));
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.org });
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.player });
  await apiRequest(`/api/events/${id}/schedule`, { method: 'POST', as: w.org, body: { startTime: '21:00', durationHours: 1 } });
  w.clock.now = Date.parse('2026-11-07T16:00:00Z');
  w.tg.members.add(w.org.id); w.tg.members.add(w.player.id);
  const d = (await (await apiRequest(`/api/events/${id}`, { as: w.org })).json()) as EventDetailDto;
  const body = { receiverUserId: w.orgUserId, receiverKaspiPhone: '87071234567', fieldAmount: 4000, extras: [], participantSignupIds: d.main.map(s => s.id) };
  const put = (b: unknown, as = w.org) => apiRequest(`/api/events/${id}/bill`, { method: 'PUT', as, body: b });
  expect((await put({ ...body, fieldAmount: -1 })).status).toBe(400);
  expect((await put({ ...body, fieldAmount: 100.5 })).status).toBe(400);
  expect((await put(body, w.player)).status).toBe(403);
  const ok = await put(body);
  expect(ok.status).toBe(200);
  const bill = (await ok.json()) as BillDto;
  expect(bill).toMatchObject({ share: 2000, status: 'open' });
  const after = (await (await apiRequest(`/api/events/${id}`, { as: w.player })).json()) as EventDetailDto;
  expect(after.bill!.id).toBe(bill.id);
  expect((await apiRequest(`/api/bills/${bill.id}/paid`, { method: 'POST', as: w.player })).status).toBe(200);
  const fin = (await (await apiRequest(`/api/events/${id}`, { as: w.player })).json()) as EventDetailDto;
  expect(fin.bill!.status).toBe('closed');
  expect(fin.status).toBe('closed');
});

test('receiver of an open bill cannot clear their Kaspi phone', async () => {
  const { id } = (await (await apiRequest('/api/events', { method: 'POST', as: w.org, body: { date: '2026-11-07', communityId: w.communityId } })).json()) as { id: number };
  await db().update(events).set({protocolVersion:0}).where(eq(events.id,id));
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.player });
  await apiRequest(`/api/events/${id}/schedule`, { method: 'POST', as: w.org, body: { startTime: '21:00', durationHours: 1 } });
  w.clock.now = Date.parse('2026-11-07T16:00:00Z');
  w.tg.members.add(w.org.id); w.tg.members.add(w.player.id);
  const d = (await (await apiRequest(`/api/events/${id}`, { as: w.org })).json()) as EventDetailDto;
  await apiRequest(`/api/events/${id}/bill`, {
    method: 'PUT', as: w.org,
    body: { receiverUserId: w.orgUserId, receiverKaspiPhone: '87071234567', fieldAmount: 4000, extras: [], participantSignupIds: d.main.map(s => s.id) },
  });
  const r = await apiRequest('/api/me', { method: 'PATCH', as: w.org, body: { kaspiPhone: null } });
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: 'receiver_needs_phone' });
  expect(await (await apiRequest('/api/me', { as: w.org })).json()).toMatchObject({ kaspiPhone: '+77071234567' });
});

test('bill remembers who it was split between', async () => {
  const { id } = (await (await apiRequest('/api/events', { method: 'POST', as: w.org, body: { date: '2026-11-07', communityId: w.communityId } })).json()) as { id: number };
  await db().update(events).set({protocolVersion:0}).where(eq(events.id,id));
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.org });
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.player });
  await apiRequest(`/api/events/${id}/schedule`, { method: 'POST', as: w.org, body: { startTime: '21:00', durationHours: 1 } });
  w.clock.now = Date.parse('2026-11-07T16:00:00Z');
  w.tg.members.add(w.org.id); w.tg.members.add(w.player.id);
  const d = (await (await apiRequest(`/api/events/${id}`, { as: w.org })).json()) as EventDetailDto;
  const orgSignup = d.main.find(s => s.userId === w.orgUserId)!.id;
  const r = await apiRequest(`/api/events/${id}/bill`, {
    method: 'PUT', as: w.org,
    body: { receiverUserId: w.orgUserId, receiverKaspiPhone: '87071234567', fieldAmount: 4000, extras: [], participantSignupIds: [orgSignup] },
  });
  expect(((await r.json()) as BillDto).participantSignupIds).toEqual([orgSignup]);
  const after = (await (await apiRequest(`/api/events/${id}`, { as: w.org })).json()) as EventDetailDto;
  expect(after.bill!.participantSignupIds).toEqual([orgSignup]);
});
