import { eq } from 'drizzle-orm';
import { bills, users } from '../../src/db/schema';
import { createEvent } from '../../src/domain/events';
import { DELETED_NAME } from '../../src/domain/privacy';
import { apiRequest, db } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);

const del = (body: unknown = { confirm: 'delete' }, as: ApiWorld['player'] | null = w.player) => apiRequest('/api/me', { as, method: 'DELETE', body });

test('a signed request with the confirmation deletes the data; the next request is a brand-new person', async () => {
  const r = await del();
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ deleted: true });
  const old = (await db().select().from(users).where(eq(users.id, w.playerUserId)))[0];
  expect(old).toMatchObject({ displayName: DELETED_NAME, tgId: -w.playerUserId });
  // Same Telegram account opens the app again: a fresh profile without groups.
  const me = await (await apiRequest('/api/me', { as: w.player })).json() as { userId: number; communities: unknown[] };
  expect(me.userId).not.toBe(w.playerUserId);
  expect(me.communities).toEqual([]);
});

test('without the confirmation or the signature nothing happens', async () => {
  expect((await del({})).status).toBe(400);
  expect((await del({ confirm: 'yes' })).status).toBe(400);
  expect((await del(undefined, null)).status).toBe(401);
  expect((await db().select().from(users).where(eq(users.id, w.playerUserId)))[0].deletedAt).toBeNull();
});

test('the receiver of an open bill is asked to close it first', async () => {
  const ev = await createEvent({ db: db(), now: w.clock.now, sync: w.sync }, { communityId: w.communityId, createdBy: w.orgUserId, date: '2026-11-20', comment: null });
  await db().insert(bills).values({ eventId: ev, receiverUserId: w.playerUserId, fieldAmount: 20000, share: 10000, createdAt: 0 });
  const r = await del();
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: 'receiver_open_bill' });
});
