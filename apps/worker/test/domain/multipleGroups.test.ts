import { and, eq } from 'drizzle-orm';
import { memberships, users } from '../../src/db/schema';
import { bindCommunity, communityUser, ensureMembership, nameTaken } from '../../src/domain/members';
import { db, seedUser } from '../helpers';
import { addGuest, createEvent, joinEvent, loadQueue } from '../../src/domain/events';
import { FakeSync } from '../fakes/fakeSync';

test('binding another group creates an independent team and repeat binding is stable', async () => {
  const a = await bindCommunity(db(), -101, 'A');
  const u = await seedUser('Игрок', { communityId: a.id });
  const b = await bindCommunity(db(), -102, 'B');
  expect(a.id).not.toBe(b.id);
  expect((await bindCommunity(db(), -101, 'A обновлена')).id).toBe(a.id);
  expect((await communityUser(db(), a.id, u.id))?.displayName).toBe('Игрок');
  expect(await communityUser(db(), b.id, u.id)).toBeNull();
});

test('a foreign identity cannot join or invite guests into another team match', async () => {
  const a = await bindCommunity(db(), -101, 'A');
  const b = await bindCommunity(db(), -102, 'B');
  const host = await seedUser('Орг', { communityId: a.id });
  const foreign = await seedUser('Другой', { communityId: b.id });
  const d = { db: db(), now: 1, sync: new FakeSync() };
  const event = await createEvent(d, { communityId: a.id, createdBy: host.id, date: '2026-12-01', comment: null });
  expect((await joinEvent(d, event, foreign.id)).kind).toBe('not_found');
  expect((await addGuest(d, event, foreign.id, 'Гость B')).kind).toBe('not_found');
  expect((await loadQueue(db(), event)).main).toHaveLength(0);
});

test('a shared Telegram identity starts with independent team profiles', async () => {
  const a = await bindCommunity(db(), -101, 'A');
  const b = await bindCommunity(db(), -102, 'B');
  const u = await seedUser('Telegram');
  await db().update(users).set({ displayName: 'Старое имя', kaspiPhone: '+77011234567', notificationsEnabled: true }).where(eq(users.id, u.id));
  await ensureMembership(db(), a.id, u.id, 10);
  await ensureMembership(db(), b.id, u.id, 10);
  await db().update(memberships).set({ displayName: 'Только A', kaspiPhone: '+77017654321', notificationsEnabled: true })
    .where(and(eq(memberships.communityId, a.id), eq(memberships.userId, u.id)));
  expect(await communityUser(db(), a.id, u.id)).toMatchObject({ displayName: 'Только A', kaspiPhone: '+77017654321', notificationsEnabled: true });
  expect(await communityUser(db(), b.id, u.id)).toMatchObject({ displayName: 'Telegram', kaspiPhone: null, notificationsEnabled: false });
  expect(await nameTaken(db(), 'Только A', undefined, a.id)).toBe(true);
  expect(await nameTaken(db(), 'Только A', undefined, b.id)).toBe(false);
});
