import { env, SELF } from 'cloudflare:test';
import { and, eq } from 'drizzle-orm';
import { MAX_GUESTS_PER_PLAYER } from '@altynka/core';
import { api, MAX_BODY_BYTES, setDepsFactoryForTests } from '../../src/api/routes';
import { getDb } from '../../src/db/client';
import { events, memberships, signups, users } from '../../src/db/schema';
import { createEvent } from '../../src/domain/events';
import { MEMBERSHIP_CACHE_MS } from '../../src/domain/members';
import { upsertBill } from '../../src/domain/bills';
import { TgRateLimited } from '../../src/telegram/client';
import { apiRequest, db, signInitData } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
let event: number;
beforeEach(async () => {
  w = await setupApiWorld();
  event = await createEvent({ db: db(), now: w.clock.now, sync: w.sync }, { communityId: w.communityId, createdBy: w.orgUserId, date: '2099-12-31', comment: null });
});
afterEach(teardownApiWorld);

/** Counts Telegram membership checks; `fail` makes them throw like a 429 from Telegram. */
function watchTelegram(fail = false) {
  const real = w.tg.memberStatus.bind(w.tg);
  const calls = { n: 0 };
  w.tg.memberStatus = async (chatId, tgUserId) => {
    calls.n++;
    if (fail) throw new TgRateLimited(7);
    return real(chatId, tgUserId);
  };
  return calls;
}
const setChecked = (checkedAt: number) => db().update(memberships).set({ checkedAt })
  .where(and(eq(memberships.communityId, w.communityId), eq(memberships.userId, w.playerUserId)));

describe('membership checks', () => {
  test('reads within MEMBERSHIP_CACHE_MS share one Telegram confirmation; changes always ask Telegram', async () => {
    const calls = watchTelegram();
    await setChecked(w.clock.now - 1000);
    for (let i = 0; i < 3; i++) expect((await apiRequest(`/api/events/${event}`, { as: w.player })).status).toBe(200);
    expect(calls.n).toBe(0);
    expect((await apiRequest(`/api/events/${event}/join`, { as: w.player, method: 'POST' })).status).toBe(200);
    expect(calls.n).toBe(1);
    // The confirmation from that change counts for later reads.
    expect((await apiRequest(`/api/events/${event}`, { as: w.player })).status).toBe(200);
    expect(calls.n).toBe(1);
    await setChecked(w.clock.now - MEMBERSHIP_CACHE_MS);
    expect((await apiRequest(`/api/events/${event}`, { as: w.player })).status).toBe(200);
    expect(calls.n).toBe(2);
  });

  test('a membership reset by a chat_member update (checkedAt 0) is not trusted from the cache', async () => {
    const calls = watchTelegram();
    await setChecked(0);
    w.tg.members.delete(w.player.id);
    expect((await apiRequest(`/api/events/${event}`, { as: w.player })).status).toBe(404);
    expect(calls.n).toBe(1);
  });

  test('when Telegram is busy a stored membership keeps reads and changes working', async () => {
    await setChecked(w.clock.now - MEMBERSHIP_CACHE_MS - 1);
    const calls = watchTelegram(true);
    expect((await apiRequest(`/api/events/${event}`, { as: w.player })).status).toBe(200);
    expect((await apiRequest(`/api/events/${event}/join`, { as: w.player, method: 'POST' })).status).toBe(200);
    expect(calls.n).toBe(2);
  });

  test('without a stored membership a busy Telegram is 503 with Retry-After, not a bare 500', async () => {
    watchTelegram(true);
    const stranger = { id: 7777, first_name: 'Новый' };
    const r = await apiRequest(`/api/events/${event}`, { as: stranger });
    expect(r.status).toBe(503);
    expect(r.headers.get('Retry-After')).toBe('7');
    expect(await r.json()).toEqual({ error: 'telegram_busy' });
  });

  test('a stored inactive membership is not a fallback', async () => {
    await db().update(memberships).set({ active: false })
      .where(and(eq(memberships.communityId, w.communityId), eq(memberships.userId, w.playerUserId)));
    watchTelegram(true);
    expect((await apiRequest(`/api/events/${event}`, { as: w.player })).status).toBe(503);
  });
});

describe('request limits', () => {
  const blocked = { limit: async () => ({ success: false }) };
  const allowed = { limit: async () => ({ success: true }) };
  const call = async (path: string, method: string, limits: Record<string, unknown>) =>
    api.request(path, { method, headers: { Authorization: `tma ${await signInitData(w.player, 'test-token', Math.floor(w.clock.now / 1000))}` } }, { ...env, ...limits });

  test('over the per-person limit the API answers 429 before touching the database', async () => {
    const before = await db().select().from(users);
    const r = await call('/me', 'GET', { API_LIMITER: blocked, WRITE_LIMITER: allowed });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'rate_limited' });
    expect(await db().select().from(users)).toEqual(before);
  });

  test('the write limit applies to changes only', async () => {
    expect((await call('/me', 'GET', { API_LIMITER: allowed, WRITE_LIMITER: blocked })).status).toBe(200);
    expect((await call(`/communities/${w.communityId}/join`, 'POST', { API_LIMITER: allowed, WRITE_LIMITER: blocked })).status).toBe(429);
  });

  test('an oversized body is 413', async () => {
    const r = await apiRequest('/api/me', { as: w.player, method: 'PATCH', body: { displayName: 'x'.repeat(MAX_BODY_BYTES) } });
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: 'too_large' });
  });

  test('an unexpected failure is a JSON 500', async () => {
    setDepsFactoryForTests(e => {
      const real = getDb(e.DB);
      return { db: new Proxy(real, { get: (t, k) => k === 'select' ? () => { throw new Error('D1 down'); } : Reflect.get(t, k) }), now: w.clock.now, sync: w.sync };
    });
    const r = await apiRequest('/api/me', { as: w.player });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'internal' });
  });
});

describe('webhook', () => {
  const post = (secret?: string) => SELF.fetch('https://altynka.test/tg/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(secret === undefined ? {} : { 'X-Telegram-Bot-Api-Secret-Token': secret }) }, body: '{}',
  });
  test.each([undefined, '', 'test-secre', 'test-secret-'])('a wrong secret (%j) is rejected', async secret => {
    expect((await post(secret)).status).toBe(401);
  });
});

describe('guests', () => {
  test('a player is held to the guest limit, an organizer is not', async () => {
    const add = (as: typeof w.player, name: string) => apiRequest(`/api/events/${event}/guests`, { as, method: 'POST', body: { name } });
    for (let i = 1; i <= MAX_GUESTS_PER_PLAYER; i++) expect((await add(w.player, `Друг${i}`)).status).toBe(200);
    const r = await add(w.player, 'Лишний');
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'guest_limit' });
    for (let i = 1; i <= MAX_GUESTS_PER_PLAYER + 1; i++) expect((await add(w.org, `Гость${i}`)).status).toBe(200);
  });
});

test('a bill for 100 participants stays within the D1 parameter limit', async () => {
  await db().update(events).set({ protocolVersion: 0, status: 'scheduled', startTime: '00:00', durationHours: 2, date: '2026-11-07' }).where(eq(events.id, event));
  await db().update(users).set({ kaspiPhone: '+77071234567' }).where(eq(users.id, w.orgUserId));
  const rows: { id: number }[] = [];
  // Ten rows per insert: the fixture itself must stay under D1's 100 bound parameters.
  for (let i = 0; i < 100; i += 10) rows.push(...await db().insert(signups)
    .values(Array.from({ length: 10 }, (_, j) => ({ eventId: event, guestName: `Гость${i + j}`, invitedBy: w.orgUserId, seq: i + j + 1, createdAt: 0 })))
    .returning({ id: signups.id }));
  const r = await upsertBill({ db: db(), now: w.clock.now, sync: w.sync }, event,
    { receiverUserId: w.orgUserId, fieldAmount: 10000, extras: [], participantSignupIds: rows.map(s => s.id) }, w.orgUserId);
  expect(r.kind).toBe('ok');
});
