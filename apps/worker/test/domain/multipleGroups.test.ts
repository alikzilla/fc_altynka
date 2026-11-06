import { eq } from 'drizzle-orm';
import { memberships, users } from '../../src/db/schema';
import { bindCommunity, ensureMembership, nameTaken } from '../../src/domain/members';
import { usersById } from '../../src/sync/parts';
import { db, seedUser, setMemberProfile } from '../helpers';
import { addGuest, createEvent, joinEvent, loadQueue } from '../../src/domain/events';
import { FakeSync } from '../fakes/fakeSync';

test('binding another group creates an independent team and repeat binding is stable', async () => {
  const a = await bindCommunity(db(), -101, 'A');
  const u = await seedUser('Игрок', { communityId: a.id });
  const b = await bindCommunity(db(), -102, 'B');
  expect(a.id).not.toBe(b.id);
  expect((await bindCommunity(db(), -101, 'A обновлена')).id).toBe(a.id);
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

test('name check only sees people who share a group', async () => {
  const a = await bindCommunity(db(), -101, 'A');
  const b = await bindCommunity(db(), -102, 'B');
  const c = await bindCommunity(db(), -103, 'C');
  await seedUser('Алихан', { communityId: a.id });
  const u1 = (await db().select().from(users).where(eq(users.displayName, 'Алихан')))[0];
  await seedUser('Дамир', { communityId: a.id });
  const u3 = await seedUser('Ербол', { communityId: b.id });
  await ensureMembership(db(), b.id, u1.id, 10);
  await seedUser('Тимур', { communityId: c.id });
  expect(await nameTaken(db(), 'дамир', u3.id)).toBe(false);
  expect(await nameTaken(db(), 'Дамир', u1.id)).toBe(true);
  expect(await nameTaken(db(), 'тимур', u1.id)).toBe(false);
});

test('profile is shared across groups', async () => {
  const a = await bindCommunity(db(), -101, 'A');
  const b = await bindCommunity(db(), -102, 'B');
  const u = await seedUser('Telegram');
  await ensureMembership(db(), a.id, u.id, 10);
  await ensureMembership(db(), b.id, u.id, 10);
  await setMemberProfile(u.id, { kaspiPhone: '+77011234567' });
  expect((await usersById(db(), [u.id])).get(u.id)?.kaspiPhone).toBe('+77011234567');
  const rows = await db().select().from(memberships).where(eq(memberships.userId, u.id));
  expect(rows).toHaveLength(2);
  for (const r of rows) expect(r).not.toHaveProperty('kaspiPhone');
});
