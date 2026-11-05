import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { communities, users } from '../../src/db/schema';
import { closeBill, markPaid, upsertBill } from '../../src/domain/bills';
import { addGuest, createEvent, joinEvent, leaveEvent, loadQueue, scheduleEvent } from '../../src/domain/events';
import { __setTgClientForTests, TgForbidden, TgRateLimited } from '../../src/telegram/client';
import { FakeTg } from '../fakes/fakeTg';
import { FakeSync } from '../fakes/fakeSync';
import { db, seedCommunity, seedUser } from '../helpers';

let tg: FakeTg;
beforeEach(() => { tg = new FakeTg(); __setTgClientForTests(tg); });
afterEach(() => __setTgClientForTests(null));
async function world(enabled = true) {
  const c = await seedCommunity();
  const org = await seedUser('Азамат', { communityId: c.id, role: 'organizer', tgId: 101 });
  const payer = await seedUser('Тимур', { communityId: c.id, tgId: 501 });
  await db().update(users).set({ notificationsEnabled: enabled, pmAvailable: true }).where(eq(users.id, payer.id));
  await db().update(users).set({ kaspiPhone: '+77071234567' }).where(eq(users.id, org.id));
  tg.members.add(501); tg.members.add(101);
  const d = { db: db(), now: Date.now(), sync: new FakeSync() };
  const ev = await createEvent(d, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: org.id });
  await joinEvent(d, ev, org.id); await joinEvent(d, ev, payer.id);
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: 'Шанырак' });
  const ids = (await loadQueue(d.db, ev)).main.map(s => s.id);
  const input = { receiverUserId: org.id, fieldAmount: 4000, extras: [], participantSignupIds: ids };
  d.now = Date.parse('2026-11-07T16:00:00Z');
  const r = await upsertBill(d, ev, input);
  if (r.kind !== 'ok') throw new Error(r.kind);
  const stub = env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${ev}`));
  return { d, payer, org, ev, billId: r.billId, stub, input };
}
async function billSync(w: Awaited<ReturnType<typeof world>>) {
  await w.stub.request(w.ev, { parts: ['bill'] });
  await runDurableObjectAlarm(w.stub);
}

test('bill delivers the opted-in payer own amount once, repeated sync edits only when changed', async () => {
  const w = await world(); await billSync(w); await billSync(w);
  expect(tg.sent.filter(m => m.chatId === 501)).toHaveLength(1);
  const pm = tg.sent.find(m => m.chatId === 501)!;
  expect(pm.html).toContain('Твоя сумма'); expect(pm.html).toContain('2 000 ₸');
  expect(pm.keyboard!.inline_keyboard.flat()).toContainEqual(expect.objectContaining({ callback_data: `pp:${w.billId}:2000:101:77071234567` }));
});

test.each(['disabled', 'not_member', 'unavailable'] as const)('no personal bill delivery when %s', async reason => {
  const w = await world(reason !== 'disabled');
  if (reason === 'not_member') tg.members.delete(501);
  if (reason === 'unavailable') await db().update(users).set({ pmAvailable: false }).where(eq(users.id, w.payer.id));
  await billSync(w);
  expect(tg.sent.some(m => m.chatId === 501)).toBe(false);
});

test('amount changes notify again, mark paid/close edit the last message and remove buttons', async () => {
  const w = await world(); await billSync(w);
  await upsertBill(w.d, w.ev, { ...w.input, fieldAmount: 6000 }); await billSync(w);
  expect(tg.sent.filter(m => m.chatId === 501)).toHaveLength(2);
  expect(tg.sent.filter(m => m.chatId === 501).at(-1)!.html).toContain('3 000 ₸');
  const first = tg.sent.find(m => m.chatId === 501)!;
  expect(tg.edited.some(m => m.chatId === 501 && m.messageId === first.messageId && !m.keyboard?.inline_keyboard.flat().some(b => 'callback_data' in b))).toBe(true);
  await markPaid(w.d, w.billId, w.payer.id, w.payer.id); await billSync(w);
  const edited = tg.edited.filter(m => m.chatId === 501).at(-1)!;
  expect(edited.html).toContain('Оплата отмечена');
  expect(edited.keyboard?.inline_keyboard.flat().some(b => 'callback_data' in b)).toBe(false);
});

test('manual closing with unpaid people does not tell them their payment was received', async () => {
  const w = await world(); await billSync(w); await closeBill(w.d, w.billId); await billSync(w);
  const last = tg.edited.filter(m => m.chatId === 501).at(-1)!;
  expect(last.html).toContain('Счёт закрыт организатором');
  expect(last.html).not.toContain('Оплата отмечена');
  expect(last.keyboard?.inline_keyboard.flat().some(b => 'callback_data' in b)).toBe(false);
});

test('blocked private destination stops retries and is marked unavailable', async () => {
  const w = await world();
  const send = tg.sendMessage.bind(tg);
  tg.sendMessage = async (chatId, html, options) => { if (chatId === 501) throw new TgForbidden('blocked'); return send(chatId, html, options); };
  await billSync(w);
  expect((await db().select().from(users).where(eq(users.id, w.payer.id)))[0].pmAvailable).toBe(false);
  expect(await runInDurableObject(w.stub, (_i, s) => s.storage.get('dirty'))).toEqual([]);
});

test('network failure keeps personal work for retry; 429 schedules retry_after', async () => {
  const w = await world(); const send = tg.sendMessage.bind(tg); let fail: Error | undefined = new Error('offline');
  tg.sendMessage = async (id, html, o) => { if (id === 501 && fail) { const e = fail; fail = undefined; throw e; } return send(id, html, o); };
  await w.stub.request(w.ev, { parts: ['bill'] }); await runDurableObjectAlarm(w.stub).catch(() => {});
  expect(await runInDurableObject(w.stub, (_i, s) => s.storage.get('dirty'))).toContain('bill');
  fail = new TgRateLimited(5); const before = Date.now();
  await runDurableObjectAlarm(w.stub);
  expect(await runInDurableObject(w.stub, (_i, s) => s.storage.getAlarm())).toBeGreaterThanOrEqual(before + 4000);
  await runDurableObjectAlarm(w.stub);
  expect(tg.sent.filter(m => m.chatId === 501)).toHaveLength(1);
});

test('manual reminder goes privately once per day; fallback only mentions unreachable debtors', async () => {
  const w = await world(); await billSync(w);
  for (let i = 0; i < 2; i++) {
    await w.stub.request(w.ev, { parts: [], notices: [{ kind: 'reminder', billId: w.billId }] });
    await runDurableObjectAlarm(w.stub);
  }
  expect(tg.sent.filter(m => m.chatId === 501 && m.html.includes('Напоминание'))).toHaveLength(1);
  expect(tg.sent.filter(m => m.chatId < 0 && m.html.includes('Напоминание'))).toHaveLength(0);
});

test('payment message is not created for a bill already closed before first delivery', async () => {
  const w = await world(); await closeBill(w.d, w.billId); await billSync(w);
  expect(tg.sent.filter(m => m.chatId === 501)).toHaveLength(0);
});

test('private and group reminders can be sent again after 24h, but not twice within it', async () => {
  const w = await world(false);
  const remind = async () => {
    await w.stub.request(w.ev, { parts: [], notices: [{ kind: 'reminder', billId: w.billId }] });
    await runDurableObjectAlarm(w.stub);
  };
  await remind(); await remind();
  expect(tg.sent.filter(m => m.html.includes('Напоминание'))).toHaveLength(1);
  await runInDurableObject(w.stub, (_i, s) => s.storage.put('reminder:501', Date.now() - 24 * 3600_000 - 1));
  await remind();
  expect(tg.sent.filter(m => m.html.includes('Напоминание'))).toHaveLength(2);
});

test('guest promotion goes to the inviter; stale moves for someone who left are suppressed', async () => {
  const c = await seedCommunity();
  const inviter = await seedUser('Тимур', { communityId: c.id, tgId: 501 });
  await db().update(users).set({ notificationsEnabled: true, pmAvailable: true }).where(eq(users.id, inviter.id));
  tg.members.add(501);
  const d = { db: db(), now: Date.now(), sync: new FakeSync() };
  const ev = await createEvent(d, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: inviter.id });
  const fillers = await Promise.all(Array.from({ length: 10 }, (_, i) => seedUser(`Игрок ${i}`, { communityId: c.id })));
  for (const u of fillers) await joinEvent(d, ev, u.id);
  const guest = await addGuest(d, ev, inviter.id, 'Ержан');
  if (!('signupId' in guest)) throw new Error('no guest');
  await leaveEvent(d, ev, fillers[0].id);
  const stub = env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${ev}`));
  await stub.request(ev, { parts: ['event'], notices: [{ kind: 'promoted', signupIds: [guest.signupId] }] });
  await runDurableObjectAlarm(stub);
  expect(tg.sent.filter(m => m.chatId === 501)).toHaveLength(1);
  expect(tg.sent.find(m => m.chatId === 501)!.html).toContain('Ержан теперь в основе');
  expect(tg.sent.filter(m => m.chatId < 0 && m.html.includes('В основе:'))).toHaveLength(0);
});

test('queued messages of a previous group never post into the newly bound group', async () => {
  const w = await world();
  await w.stub.request(w.ev, { parts: ['event', 'bill'] });
  await db().update(communities).set({ tgChatId: -100999 });
  await runDurableObjectAlarm(w.stub);
  expect(tg.sent).toHaveLength(0);
});

test('removed member is not mentioned by movement fallback', async () => {
  const c = await seedCommunity(); const d = { db: db(), now: Date.now(), sync: new FakeSync() };
  const us = await Promise.all(Array.from({ length: 11 }, (_, i) => seedUser(`Игрок${i}`, { communityId: c.id })));
  const ev = await createEvent(d, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: us[0].id });
  for (const u of us) await joinEvent(d, ev, u.id);
  await leaveEvent(d, ev, us[0].id);
  const signup = (await loadQueue(d.db, ev)).main.at(-1)!;
  const stub = env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${ev}`));
  await stub.request(ev, { parts: [], notices: [{ kind: 'promoted', signupIds: [signup.id] }] });
  await runDurableObjectAlarm(stub);
  expect(tg.sent).toHaveLength(0);
});

test('a rate limit pauses all further Telegram calls in this personal batch', async () => {
  const w = await world();
  const another = await seedUser('Ещё игрок', { communityId: (await db().select().from(communities))[0].id, tgId: 502 });
  await db().update(users).set({ notificationsEnabled: true, pmAvailable: true }).where(eq(users.id, another.id));
  // Add a third payer directly to a second current bill line without changing the frozen roster.
  const { billLines } = await import('../../src/db/schema');
  await db().insert(billLines).values({ billId: w.billId, userId: another.id, units: 1, amount: 2000 });
  tg.members.add(502);
  let limited = false; let callsAfterLimit = 0;
  const send = tg.sendMessage.bind(tg); const member = tg.isMember.bind(tg);
  tg.sendMessage = async (id, html, o) => {
    if (limited) callsAfterLimit++;
    if (id === 501) { limited = true; throw new TgRateLimited(5); }
    return send(id, html, o);
  };
  tg.isMember = async (chatId, id) => { if (limited) callsAfterLimit++; return member(chatId, id); };
  await billSync(w);
  expect(limited).toBe(true);
  expect(callsAfterLimit).toBe(0);
});

test('reminder retries preserve already delivered recipients and report totals', async () => {
  const w = await world();
  const another = await seedUser('Второй', { communityId: (await db().select().from(communities))[0].id, tgId: 502 });
  await db().update(users).set({ notificationsEnabled: true, pmAvailable: true }).where(eq(users.id, another.id));
  const { billLines } = await import('../../src/db/schema');
  await db().insert(billLines).values({ billId: w.billId, userId: another.id, units: 1, amount: 2000 });
  tg.members.add(502);
  const send = tg.sendMessage.bind(tg); let failOnce = true;
  tg.sendMessage = async (id, html, o) => { if (id === 501 && failOnce) { failOnce = false; throw new Error('offline'); } return send(id, html, o); };
  await w.stub.request(w.ev, { parts: [], notices: [{ kind: 'reminder', billId: w.billId }] });
  await runDurableObjectAlarm(w.stub).catch(() => {});
  expect(tg.sent.filter(m => m.chatId === 502)).toHaveLength(1);
  expect(await w.stub.deliveryReport()).toMatchObject({ status: 'retrying', sent: 1, failed: 1 });
  await runDurableObjectAlarm(w.stub);
  expect(tg.sent.filter(m => m.chatId === 502)).toHaveLength(1);
  expect(tg.sent.filter(m => m.chatId === 501)).toHaveLength(1);
  expect(await w.stub.deliveryReport()).toMatchObject({ status: 'complete', sent: 2, failed: 0, skipped: 0 });
});
