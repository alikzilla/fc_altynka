import type { EventDetailDto, EventsListDto } from '@sbor/core';
import { apiRequest } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);

async function newEvent(): Promise<number> {
  const r = await apiRequest('/api/events', { method: 'POST', as: w.org, body: { date: '2026-11-07' } });
  expect(r.status).toBe(200);
  return ((await r.json()) as { id: number }).id;
}

test('organizer creates event and it requests a sync', async () => {
  const id = await newEvent();
  expect(w.sync.calls.at(-1)).toEqual({ eventId: id, req: { parts: ['event'] } });
  const list = (await (await apiRequest('/api/events', { as: w.player })).json()) as EventsListDto;
  expect(list.active.map(e => e.id)).toEqual([id]);
  expect(list.active[0]).toMatchObject({ date: '2026-11-07', status: 'collecting', limit: 10, mainCount: 0, my: null });
});

test('player cannot create events or schedule', async () => {
  expect((await apiRequest('/api/events', { method: 'POST', as: w.player, body: { date: '2026-11-07' } })).status).toBe(403);
  const id = await newEvent();
  const r = await apiRequest(`/api/events/${id}/schedule`, { method: 'POST', as: w.player, body: { startTime: '21:00', durationHours: 2 } });
  expect(r.status).toBe(403);
});

test('player gets no levels in event detail, organizer does', async () => {
  const id = await newEvent();
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.player });
  await apiRequest(`/api/events/${id}/guests`, { method: 'POST', as: w.player, body: { name: 'Ержан' } });
  const asPlayer = (await (await apiRequest(`/api/events/${id}`, { as: w.player })).json()) as EventDetailDto;
  expect(asPlayer.main).toHaveLength(2);
  for (const s of asPlayer.main) expect(s).not.toHaveProperty('level');
  expect(asPlayer.my).toBe('main');
  expect(asPlayer.main[1]).toMatchObject({ name: 'Ержан', guestOfName: 'Игрок', invitedByUserId: w.playerUserId });
  const asOrg = (await (await apiRequest(`/api/events/${id}`, { as: w.org })).json()) as EventDetailDto;
  expect(asOrg.main.map(s => s.level)).toEqual([5, 5]);
  expect(asOrg.teams).toBeNull();
  expect(asOrg.bill).toBeNull();
});

test('join returns the queue position; unknown event is 404', async () => {
  const id = await newEvent();
  const r = await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.player });
  expect(await r.json()).toEqual({ kind: 'main', position: 1, restored: false });
  expect((await apiRequest('/api/events/9999', { as: w.player })).status).toBe(404);
  expect((await apiRequest('/api/events/9999/join', { method: 'POST', as: w.player })).status).toBe(404);
});

test('schedule validates time and duration', async () => {
  const id = await newEvent();
  const post = (body: unknown) => apiRequest(`/api/events/${id}/schedule`, { method: 'POST', as: w.org, body });
  expect((await post({ startTime: '25:00', durationHours: 2 })).status).toBe(400);
  expect((await post({ startTime: '21:00', durationHours: 3 })).status).toBe(400);
  expect((await post({ startTime: '21:00', durationHours: 2, place: '  Шанырак ' })).status).toBe(200);
  const d = (await (await apiRequest(`/api/events/${id}`, { as: w.org })).json()) as EventDetailDto;
  expect(d).toMatchObject({ status: 'scheduled', startTime: '21:00', durationHours: 2, place: 'Шанырак', limit: 15 });
});

test('guest name is trimmed and length-checked', async () => {
  const id = await newEvent();
  const post = (name: string) => apiRequest(`/api/events/${id}/guests`, { method: 'POST', as: w.player, body: { name } });
  expect((await post('   ')).status).toBe(400);
  expect((await post('x'.repeat(25))).status).toBe(400);
  expect((await post('  Ержан ')).status).toBe(200);
});

test('signup removal permissions map to HTTP codes', async () => {
  const id = await newEvent();
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.org });
  const d = (await (await apiRequest(`/api/events/${id}`, { as: w.org })).json()) as EventDetailDto;
  const sid = d.main[0].id;
  expect((await apiRequest(`/api/signups/${sid}`, { method: 'DELETE', as: w.player })).status).toBe(403);
  expect((await apiRequest(`/api/signups/${sid}`, { method: 'DELETE', as: w.org })).status).toBe(200);
  expect((await apiRequest(`/api/signups/${sid}`, { method: 'DELETE', as: w.org })).status).toBe(404);
});

test('cancel by organizer, then join is 409', async () => {
  const id = await newEvent();
  expect((await apiRequest(`/api/events/${id}/cancel`, { method: 'POST', as: w.org })).status).toBe(200);
  expect((await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.player })).status).toBe(409);
  const list = (await (await apiRequest('/api/events', { as: w.player })).json()) as EventsListDto;
  expect(list.active).toHaveLength(0);
  expect(list.past.map(e => e.id)).toEqual([id]);
});

test('adding the same guest again answers 409 guest_exists', async () => {
  const id = await newEvent();
  const add = () => apiRequest(`/api/events/${id}/guests`, { method: 'POST', as: w.player, body: { name: 'Ержан' } });
  expect((await add()).status).toBe(200);
  const again = await add();
  expect(again.status).toBe(409);
  expect(await again.json()).toEqual({ error: 'guest_exists' });
});
