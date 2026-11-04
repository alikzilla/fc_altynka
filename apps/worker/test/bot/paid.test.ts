import { eq } from 'drizzle-orm';
import { users } from '../../src/db/schema';
import { upsertBill } from '../../src/domain/bills';
import { createEvent, joinEvent, loadQueue, scheduleEvent } from '../../src/domain/events';
import { upsertTgUser } from '../../src/domain/members';
import { FakeSync } from '../fakes/fakeSync';
import { db, seedCommunity, seedUser } from '../helpers';
import { makeTestBot, tap } from './helpers';

test('p: callback marks paid once', async () => {
  const d = { db: db(), now: 1, sync: new FakeSync() };
  const c = await seedCommunity();
  const org = await seedUser('Орг', { communityId: c.id, role: 'organizer', tgId: 3001 });
  await db().update(users).set({ kaspiPhone: '+77071234567' }).where(eq(users.id, org.id));
  const ev = await createEvent(d, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: org.id });
  const payer = await upsertTgUser(db(), { id: 501, first_name: 'Арман' }, 1);
  await joinEvent(d, ev, org.id);
  await joinEvent(d, ev, payer.id);
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: null });
  const ids = (await loadQueue(db(), ev)).main.map(s => s.id);
  const r = (await upsertBill(d, ev, { receiverUserId: org.id, fieldAmount: 4000, extras: [], participantSignupIds: ids })) as { billId: number };
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, `p:${r.billId}`));
  await t.bot.handleUpdate(tap(501, `p:${r.billId}`));
  await t.bot.handleUpdate(tap(777, `p:${r.billId}`));
  expect(t.answers()).toEqual(['Ты отметил оплату', 'Счёт закрыт', 'Счёт закрыт']);
});
