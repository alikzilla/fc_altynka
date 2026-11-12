import type { VenuesDto } from '@altynka/core';
import { communities, venues } from '../../src/db/schema';
import { apiRequest, db, seedUser } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
let path: string;
beforeEach(async () => { w = await setupApiWorld(); path = `/api/venues?communityId=${w.communityId}`; });
afterEach(teardownApiWorld);

const add = (body: unknown, as = w.org) => apiRequest(path, { as, method: 'POST', body });
const list = async (as = w.player) => (await (await apiRequest(path, { as })).json<VenuesDto>()).venues;

test('the organizer adds venues; every member of the group sees them in the order added', async () => {
  expect(await list()).toEqual([]);
  const res = await add({ name: '  Манеж Арена ', address: 'Толе би, 1', mapUrl: 'https://go.2gis.com/abc', hourlyRate: 25000 });
  expect(res.status).toBe(200);
  const dto = await res.json<VenuesDto & { venue: { id: number } }>();
  expect(dto.venue).toEqual({ id: expect.any(Number), name: 'Манеж Арена', address: 'Толе би, 1', mapUrl: 'https://go.2gis.com/abc', hourlyRate: 25000 });
  expect((await add({ name: 'Школа Аксай' })).status).toBe(200);
  expect(await list()).toEqual([
    dto.venue,
    { id: expect.any(Number), name: 'Школа Аксай', address: null, mapUrl: null, hourlyRate: null },
  ]);
});

test('a player cannot add or delete; duplicates and bad input are rejected', async () => {
  expect((await add({ name: 'Манеж' }, w.player)).status).toBe(403);
  expect((await add({ name: 'Манеж' })).status).toBe(200);
  const dup = await add({ name: 'манеж' });
  expect(dup.status).toBe(409);
  expect(await dup.json()).toEqual({ error: 'duplicate' });
  for (const body of [{ name: ' ' }, { name: 'x'.repeat(81) }, { name: 'A', mapUrl: 'http://2gis.kz/x' }, { name: 'A', mapUrl: 'javascript:alert(1)' }, { name: 'A', hourlyRate: -1 }, { name: 'A', hourlyRate: 1.5 }])
    expect((await add(body)).status).toBe(400);
  const [venue] = await list();
  expect((await apiRequest(`/api/venues/${venue.id}`, { as: w.player, method: 'DELETE' })).status).toBe(403);
  expect(await list()).toHaveLength(1);
});

test('deleting a venue leaves matches that name it untouched', async () => {
  await add({ name: 'Манеж' });
  const [venue] = await list();
  const { id } = await (await apiRequest('/api/events', { as: w.org, method: 'POST', body: { date: '2026-11-10', communityId: w.communityId } })).json<{ id: number }>();
  expect((await apiRequest(`/api/events/${id}/schedule`, { as: w.org, method: 'POST', body: { startTime: '21:00', durationHours: 1, place: 'Манеж' } })).status).toBe(200);
  const res = await apiRequest(`/api/venues/${venue.id}`, { as: w.org, method: 'DELETE' });
  expect(await res.json()).toEqual({ venues: [] });
  expect((await (await apiRequest(`/api/events/${id}`, { as: w.org })).json<{ place: string }>()).place).toBe('Манеж');
  expect((await apiRequest(`/api/venues/${venue.id}`, { as: w.org, method: 'DELETE' })).status).toBe(404);
});

test('venues belong to one group: another group neither sees nor deletes them', async () => {
  await add({ name: 'Манеж' });
  const [venue] = await list();
  const [other] = await db().insert(communities).values({ tgChatId: -100777, title: 'Другая' }).returning();
  await seedUser('Чужой орг', { communityId: other.id, tgId: 3001, role: 'organizer' });
  w.tg.chatMembers.set(other.tgChatId, new Set([3001]));
  const stranger = { id: 3001, first_name: 'Чужой орг' };
  expect((await apiRequest(path, { as: stranger })).status).toBe(403);
  expect((await apiRequest('/api/venues', { as: w.org })).status).toBe(403);
  expect((await apiRequest(`/api/venues/${venue.id}`, { as: stranger, method: 'DELETE' })).status).toBe(404);
  const own = await apiRequest(`/api/venues?communityId=${other.id}`, { as: stranger, method: 'POST', body: { name: 'Манеж' } });
  expect(own.status).toBe(200);
  expect(await db().select().from(venues)).toHaveLength(2);
});

test('the organizer edits a venue; a rename cannot collide and never touches a foreign group', async () => {
  const first = (await (await add({ name: 'Манеж', hourlyRate: 20000 })).json<{ venue: { id: number } }>()).venue;
  await add({ name: 'Школа' });
  const patch = (id: number, body: unknown, as = w.org) => apiRequest(`/api/venues/${id}`, { as, method: 'PATCH', body });
  expect((await patch(first.id, { name: 'Манеж' }, w.player)).status).toBe(403);
  const saved = await patch(first.id, { name: ' Манеж Арена ', address: 'Толе би, 1', mapUrl: 'https://go.2gis.com/abc', hourlyRate: null });
  expect(saved.status).toBe(200);
  expect((await saved.json<VenuesDto & { venue: unknown }>()).venue).toEqual({ id: first.id, name: 'Манеж Арена', address: 'Толе би, 1', mapUrl: 'https://go.2gis.com/abc', hourlyRate: null });
  // Keeping its own name (any case) is not a duplicate; taking another venue's name is.
  expect((await patch(first.id, { name: 'манеж арена' })).status).toBe(200);
  const dup = await patch(first.id, { name: 'ШКОЛА' });
  expect(dup.status).toBe(409);
  expect(await dup.json()).toEqual({ error: 'duplicate' });
  expect((await patch(first.id, { name: 'x', mapUrl: 'http://insecure.example' })).status).toBe(400);
  expect((await list()).map(v => v.name)).toEqual(['манеж арена', 'Школа']);
  const [foreign] = await db().insert(communities).values({ tgChatId: -900, title: 'Чужая' }).returning();
  w.tg.chatMembers.set(foreign.tgChatId, new Set([3001]));
  const [theirs] = await db().insert(venues).values({ communityId: foreign.id, name: 'Чужое поле', createdAt: 1 }).returning();
  expect((await patch(theirs.id, { name: 'Захват' })).status).toBe(404);
  expect((await patch(999999, { name: 'Нет' })).status).toBe(404);
});
