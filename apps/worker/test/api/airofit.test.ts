import type { EventSummaryDto } from '@altynka/core';
import { eq } from 'drizzle-orm';
import { billLines, bills, communities, events, signups, type EventRow } from '../../src/db/schema';
import { apiRequest, db } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);

async function event(status: EventRow['status'], date = '2026-11-01', communityId = w.communityId) {
  return (await db().insert(events).values({ communityId, date, status, place: 'Шанырак', createdBy: w.orgUserId, createdAt: 0 }).returning())[0];
}

async function debt(ev: EventRow, paidAmount: number | null, userId = w.playerUserId, status: 'open' | 'closed' = 'open') {
  const [bill] = await db().insert(bills).values({ eventId: ev.id, receiverUserId: w.orgUserId, fieldAmount: 3000, share: 3000, status, createdAt: 0 }).returning();
  const [line] = await db().insert(billLines).values({ billId: bill.id, userId, units: 1, amount: 3000, paidAmount }).returning();
  return { bill, line };
}

test('me returns signed Telegram identity on GET and PATCH, refreshes it without replacing club name', async () => {
  const as = { ...w.player, first_name: 'Дамир', last_name: 'Иманов', username: 'damir', photo_url: 'https://t.me/i/userpic/320/damir.jpg' };
  const initial = await apiRequest('/api/me', { communityId: w.communityId, as });
  expect(initial.status).toBe(200);
  expect(await initial.json()).toMatchObject({ displayName: 'Игрок', telegram: { firstName: 'Дамир', lastName: 'Иманов', username: 'damir', photoUrl: as.photo_url } });
  const updated = await apiRequest('/api/me', { communityId: w.communityId, method: 'PATCH', as: { ...as, first_name: 'Данияр', username: 'daniyar' }, body: { displayName: 'Вратарь', telegram: { firstName: 'Подмена' } } });
  expect(await updated.json()).toMatchObject({ displayName: 'Вратарь', telegram: { firstName: 'Данияр', lastName: 'Иманов', username: 'daniyar', photoUrl: as.photo_url } });
  const removed = await apiRequest('/api/me', { communityId: w.communityId, as: w.player });
  expect(await removed.json()).toMatchObject({ displayName: 'Вратарь', telegram: { firstName: 'Игрок', lastName: null, username: null, photoUrl: null } });
});

test.each(['http://example.com/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,abc', '//example.com/a.jpg', 'not a url'])('me rejects unsafe Telegram photo %s', async photo_url => {
  const as = { ...w.player, photo_url };
  expect(await (await apiRequest('/api/me', { communityId: w.communityId, as })).json()).toMatchObject({ telegram: { photoUrl: null } });
});

test('archive paginates equal dates once each, includes billing, and isolates groups and active games', async () => {
  const rows = [];
  for (let n = 0; n < 23; n++) rows.push(await event(n % 3 === 0 ? 'billing' : n % 3 === 1 ? 'closed' : 'cancelled'));
  const oldest = await event('closed', '2026-10-01');
  await event('collecting');
  await event('scheduled');
  const [other] = await db().insert(communities).values({ tgChatId: -100501, title: 'Чужая' }).returning();
  await event('closed', '2026-12-01', other.id);
  await db().insert(signups).values([
    { eventId: rows[22].id, userId: w.playerUserId, seq: 1, createdAt: 0 },
    { eventId: rows[22].id, userId: w.orgUserId, seq: 2, leftAt: 100, createdAt: 0 },
  ]);
  const get = async (suffix = '') => {
    const response = await apiRequest(`/api/matches${suffix}`, { communityId: w.communityId, as: w.player });
    expect(response.status).toBe(200);
    return response.json() as Promise<{ events: EventSummaryDto[]; nextCursor: string | null }>;
  };
  const first = await get();
  expect(first.events.map(e => e.id)).toEqual(rows.slice(3).reverse().map(e => e.id));
  expect(first.events[0]).toMatchObject({ mainCount: 1, reserveCount: 0, my: 'main' });
  expect(first.nextCursor).toEqual(expect.any(String));
  const second = await get(`?cursor=${encodeURIComponent(first.nextCursor!)}`);
  expect(second.events.map(e => e.id)).toEqual([rows[2].id, rows[1].id, rows[0].id, oldest.id]);
  expect(second.nextCursor).toBeNull();
});

test.each(['', 'garbage', '2026-02-30:1', '2026-11-01:0', '2026-11-01:-2', '2026-11-01:1.5', '2026-11-01:9007199254740992'])('archive rejects invalid cursor %s', async cursor => {
  const response = await apiRequest(`/api/matches?cursor=${encodeURIComponent(cursor)}`, { communityId: w.communityId, as: w.player });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid_cursor' });
});

test('notifications return only current user remaining open debt and disappear after payment', async () => {
  const unpaid = await event('billing', '2026-11-02');
  const partial = await event('billing', '2026-11-01');
  const { line } = await debt(unpaid, null);
  await debt(partial, 1250);
  await debt(await event('billing'), 3000);
  await debt(await event('billing'), 3500);
  await debt(await event('closed'), null, w.playerUserId, 'closed');
  await debt(await event('billing'), null, w.orgUserId);
  const [other] = await db().insert(communities).values({ tgChatId: -100501, title: 'Чужая' }).returning();
  await debt(await event('billing', '2026-12-01', other.id), null);
  const get = () => apiRequest('/api/notifications', { communityId: w.communityId, as: w.player });
  const response = await get();
  expect(response.status).toBe(200);
  const body = await response.json() as { tasks: Array<{ id: string; eventId: number }> };
  expect(body.tasks).toEqual([
    { kind: 'payment', id: expect.any(String), eventId: partial.id, date: '2026-11-01', place: 'Шанырак', due: 1750, receiverName: 'Орг' },
    { kind: 'payment', id: expect.any(String), eventId: unpaid.id, date: '2026-11-02', place: 'Шанырак', due: 3000, receiverName: 'Орг' },
    { kind: 'skills', id: 'skills' },
  ]);
  expect(new Set(body.tasks.map(t => t.id)).size).toBe(3);
  expect(await (await get()).json()).toEqual(body);
  await db().update(billLines).set({ paidAmount: 3000 }).where(eq(billLines.id, line.id));
  expect(await (await get()).json()).toEqual({ tasks: [body.tasks[0], { kind: 'skills', id: 'skills' }] });
});

test('only organizers and admins receive collecting scheduling duties in their group', async () => {
  const later = await event('collecting', '2026-11-08');
  const first = await event('collecting', '2026-11-07');
  const tie = await event('collecting', '2026-11-07');
  await event('scheduled');
  await event('billing');
  await event('cancelled');
  const [other] = await db().insert(communities).values({ tgChatId: -100501, title: 'Чужая' }).returning();
  await event('collecting', '2026-11-06', other.id);
  const playerResponse = await apiRequest('/api/notifications', { communityId: w.communityId, as: w.player });
  expect(playerResponse.status).toBe(200);
  expect(await playerResponse.json()).toEqual({ tasks: [{ kind: 'skills', id: 'skills' }] });
  const expected = { tasks: [{ kind: 'skills', id: 'skills' }, ...[first, tie, later].map(e => ({ kind: 'schedule', id: expect.any(String), eventId: e.id, date: e.date, place: 'Шанырак' }))] };
  for (const as of [w.org, w.admin]) {
    const response = await apiRequest('/api/notifications', { communityId: w.communityId, as });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
  }
});

test('new resources require Telegram authentication', async () => {
  for (const path of ['/api/matches', '/api/notifications']) expect((await apiRequest(path, { communityId: w.communityId, as: null })).status).toBe(401);
});
