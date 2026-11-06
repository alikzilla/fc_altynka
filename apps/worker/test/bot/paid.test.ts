import { eq } from 'drizzle-orm';
import { events, users } from '../../src/db/schema';
import { upsertBill } from '../../src/domain/bills';
import { createEvent, joinEvent, loadQueue, scheduleEvent } from '../../src/domain/events';
import { upsertTgUser } from '../../src/domain/members';
import { FakeSync } from '../fakes/fakeSync';
import { setMemberProfile, localUser, db, seedCommunity, seedUser } from '../helpers';
import { makeTestBot, tap } from './helpers';
import { __setTgClientForTests } from '../../src/telegram/client';
import { FakeTg } from '../fakes/fakeTg';
import { ensureMembership } from '../../src/domain/members';

afterEach(() => __setTgClientForTests(null));

test('p: callback marks paid once', async () => {
  const d = { db: db(), now: 1, sync: new FakeSync() };
  const c = await seedCommunity();
  const org = await seedUser('Орг', { communityId: c.id, role: 'organizer', tgId: 3001 });
  await setMemberProfile(org.id, { kaspiPhone: '+77071234567' });
  const ev = await createEvent(d, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: org.id });
  // Legacy appointment fixture; manual sessions are covered by gameFinish tests.
  await d.db.update(events).set({protocolVersion:0}).where(eq(events.id,ev));
  const payer = await upsertTgUser(db(), { id: 501, first_name: 'Арман' }, 1);
  await ensureMembership(db(), c.id, payer.id, d.now);
  const tg = new FakeTg(); tg.members.add(501); tg.members.add(777); __setTgClientForTests(tg);
  await joinEvent(d, ev, org.id);
  await joinEvent(d, ev, payer.id);
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: null });
  d.now = Date.parse('2026-11-07T16:00:00Z');
  const ids = (await loadQueue(db(), ev)).main.map(s => s.id);
  const r = (await upsertBill(d, ev, { receiverUserId: org.id, fieldAmount: 4000, extras: [], participantSignupIds: ids })) as { billId: number };
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, `p:${r.billId}`));
  await t.bot.handleUpdate(tap(501, `p:${r.billId}`));
  await t.bot.handleUpdate(tap(777, `p:${r.billId}`));
  expect(t.answers()).toEqual(['Ты отметил оплату', 'Счёт закрыт', 'Счёт закрыт']);
});
