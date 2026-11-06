import { eq } from 'drizzle-orm';
import { billLines, users } from '../../src/db/schema';
import { upsertBill } from '../../src/domain/bills';
import { createEvent, joinEvent, loadQueue, scheduleEvent } from '../../src/domain/events';
import { __setTgClientForTests } from '../../src/telegram/client';
import { FakeSync } from '../fakes/fakeSync';
import { FakeTg } from '../fakes/fakeTg';
import { setMemberProfile, localUser, db, seedCommunity, seedUser } from '../helpers';
import { makeTestBot, tap } from './helpers';

async function world() {
  const c = await seedCommunity();
  const org = await seedUser('Орг', { communityId: c.id, role: 'organizer', tgId: 101 });
  const payer = await seedUser('Игрок', { communityId: c.id, tgId: 501 });
  const tg = new FakeTg(); tg.members.add(501);
  __setTgClientForTests(tg);
  const d = { db: db(), now: Date.now(), sync: new FakeSync() };
  await setMemberProfile(org.id, { kaspiPhone: '+77071234567' });
  const eventId = await createEvent(d, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: org.id });
  await joinEvent(d, eventId, org.id); await joinEvent(d, eventId, payer.id);
  await scheduleEvent(d, eventId, { startTime: '21:00', durationHours: 1, place: 'Поле' });
  d.now = Date.parse('2026-11-07T16:00:00Z');
  const ids = (await loadQueue(d.db, eventId)).main.map(s => s.id);
  const result = await upsertBill(d, eventId, { receiverUserId: org.id, fieldAmount: 4000, extras: [], participantSignupIds: ids });
  if (result.kind !== 'ok') throw new Error(result.kind);
  return { d, payer, eventId, billId: result.billId, tg };
}
afterEach(() => __setTgClientForTests(null));

test('private payment callback marks only the sender own current amount', async () => {
  const w = await world(); const t = makeTestBot();
  const update = tap(501, `pp:${w.billId}:2000:101:77071234567`, 'Игрок', 501);
  update.callback_query!.message!.chat.type = 'private';
  await t.bot.handleUpdate(update);
  expect(t.answers()).toEqual(['Ты отметил оплату']);
  const lines = await db().select().from(billLines);
  expect(lines.find(l => l.userId === w.payer.id)?.paidAmount).toBe(2000);
});

test.each(['pp:1:1000:101:77071234567', 'pp:1:2000:999:77071234567'])('stale private payment %s does not mark a changed obligation', async data => {
  const w = await world(); const t = makeTestBot();
  const update = tap(501, data.replace('pp:1:', `pp:${w.billId}:`), 'Игрок', 501);
  update.callback_query!.message!.chat.type = 'private';
  await t.bot.handleUpdate(update);
  expect(t.answers()[0]).toContain('Счёт изменился');
  expect((await db().select().from(billLines)).find(l => l.userId === w.payer.id)?.paidAmount).toBeNull();
});

test('removed group member cannot use an old private payment button', async () => {
  const w = await world(); w.tg.members.clear(); const t = makeTestBot();
  const update = tap(501, `pp:${w.billId}:2000:101:77071234567`, 'Игрок', 501);
  update.callback_query!.message!.chat.type = 'private';
  await t.bot.handleUpdate(update);
  expect(t.answers()[0]).toContain('недоступен');
  expect((await db().select().from(billLines)).find(l => l.userId === w.payer.id)?.paidAmount).toBeNull();
});

test('a private payment button cannot mark paid after the receiver changed Kaspi phone', async () => {
  const w = await world(); const t = makeTestBot();
  const [receiver] = await db().select().from(users).where(eq(users.tgId, 101));
  await setMemberProfile(receiver.id, { kaspiPhone: '+77079999999' });
  const update = tap(501, `pp:${w.billId}:2000:101:77071234567`, 'Игрок', 501);
  update.callback_query!.message!.chat.type = 'private';
  await t.bot.handleUpdate(update);
  expect(t.answers()[0]).toContain('Счёт изменился');
  expect((await db().select().from(billLines)).find(l => l.userId === w.payer.id)?.paidAmount).toBeNull();
});
