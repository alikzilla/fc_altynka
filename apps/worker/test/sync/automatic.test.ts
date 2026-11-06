import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { communities, events, users } from '../../src/db/schema';
import { closeBill, markPaid, upsertBill } from '../../src/domain/bills';
import { addGuest, cancelEvent, createEvent, getEvent, joinEvent, leaveEvent, loadQueue, scheduleEvent } from '../../src/domain/events';
import { finishMatch, submitReview } from '../../src/domain/ratings';
import { __setTgClientForTests, TgForbidden, TgRateLimited } from '../../src/telegram/client';
import { FakeSync } from '../fakes/fakeSync';
import { FakeTg } from '../fakes/fakeTg';
import { setMemberProfile, localUser, db, seedCommunity, seedUser } from '../helpers';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const START = Date.parse('2026-11-07T05:00:00Z'); // 10:00 Алматы
const KICKOFF = Date.parse('2026-11-07T16:00:00Z');
let now: number;
let tg: FakeTg;
let clock: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  now = START;
  clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  tg = new FakeTg(); __setTgClientForTests(tg);
});
afterEach(() => { clock.mockRestore(); __setTgClientForTests(null); });

async function world() {
  const community = await seedCommunity();
  const org = await seedUser('Организатор', { tgId: 101, communityId: community.id, role: 'organizer' });
  const payer = await seedUser('Тимур', { tgId: 501, communityId: community.id });
  await setMemberProfile(payer.id, { notificationsEnabled: true, pmAvailable: true, kaspiPhone: '+77071234567' });
  await setMemberProfile(org.id, { kaspiPhone: '+77071234567' });
  tg.members.add(101); tg.members.add(501);
  const d = { db: db(), get now() { return now; }, sync: new FakeSync() };
  const ev = await createEvent(d, { communityId: community.id, date: '2026-11-07', comment: null, createdBy: org.id });
  await joinEvent(d, ev, org.id); await joinEvent(d, ev, payer.id);
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: 'Шанырак' });
  const stub = env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${ev}`));
  const alarm = () => runInDurableObject(stub, (_i, s) => s.storage.getAlarm());
  const flush = () => runDurableObjectAlarm(stub);
  const matchSync = async () => { await stub.request(ev, { parts: ['event'] }); await flush(); };
  const personal = () => tg.sent.filter(m => m.chatId === payer.tgId);
  const reminders = () => personal().filter(m => m.html.includes('Напоминание об оплате'));
  async function bill() {
    now = KICKOFF;
    const ids = (await loadQueue(db(), ev)).main.map(s => s.id);
    const r = await upsertBill(d, ev, { receiverUserId: org.id, fieldAmount: 4000, extras: [], participantSignupIds: ids });
    if (r.kind !== 'ok') throw new Error(r.kind);
    await stub.request(ev, { parts: ['bill', 'event'] }); await flush();
    return r.billId;
  }
  async function finish() {
    now = KICKOFF + HOUR;
    const ids = (await loadQueue(db(), ev)).main.map(s => s.id);
    expect(await finishMatch(d, (await getEvent(db(), ev))!, org.id, ids)).toBe('ok');
    const req = d.sync.calls.at(-1)!;
    expect(req.req).toEqual({ parts: [], review: true });
    await stub.request(ev, req.req); await flush();
  }
  return { community, org, payer, d, ev, stub, alarm, flush, matchSync, personal, reminders, bill, finish };
}

test('match alarm wakes two hours before kickoff, groups guests, and delivers once per recipient', async () => {
  const w = await world();
  await addGuest(w.d, w.ev, w.payer.id, '<Друг>');
  await w.matchSync();
  expect(await w.alarm()).toBe(KICKOFF - 2 * HOUR);
  expect(w.personal()).toHaveLength(0);
  now = KICKOFF - 2 * HOUR;
  await w.flush(); await w.matchSync();
  expect(w.personal()).toHaveLength(1);
  expect(w.personal()[0].html).toContain('Скоро матч');
  expect(w.personal()[0].html).toContain('21:00');
  expect(w.personal()[0].html).toContain('Шанырак');
  expect(w.personal()[0].html).toContain('&lt;Друг&gt;');
  expect(await w.alarm()).toBe(KICKOFF);
});

test.each(['left', 'reserve', 'disabled', 'unavailable', 'not_member', 'cancelled', 'started'] as const)('match reminder skips %s without a group fallback or busy alarm', async reason => {
  const w = await world(); await w.matchSync();
  if (reason === 'left') await leaveEvent(w.d, w.ev, w.payer.id);
  if (reason === 'reserve') await db().update(events).set({ baseLimit: 1 }).where(eq(events.id, w.ev));
  if (reason === 'disabled') await setMemberProfile(w.payer.id, { notificationsEnabled: false });
  if (reason === 'unavailable') await setMemberProfile(w.payer.id, { pmAvailable: false });
  if (reason === 'not_member') tg.members.delete(w.payer.tgId);
  if (reason === 'cancelled') await cancelEvent(w.d, w.ev);
  now = reason === 'started' ? KICKOFF : KICKOFF - 2 * HOUR;
  await w.flush();
  expect(w.personal()).toHaveLength(0);
  expect(tg.sent.some(m => m.chatId < 0 && m.html.includes('Скоро матч'))).toBe(false);
  const next = await w.alarm();
  expect(next === null || next > now).toBe(true);
});

test('rescheduling replaces the reminder deadline and a late scheduled match notifies before kickoff', async () => {
  const w = await world(); await w.matchSync();
  await scheduleEvent(w.d, w.ev, { startTime: '23:00', durationHours: 1, place: 'Новое поле' });
  await w.matchSync();
  expect(await w.alarm()).toBe(KICKOFF);
  now = KICKOFF + HOUR;
  await w.flush();
  expect(w.personal()).toHaveLength(1);
  expect(w.personal()[0].html).toContain('23:00');
  expect(w.personal()[0].html).toContain('Новое поле');
});

test('automatic payment reminders start after 24h, respect quiet hours, and stop after three successful sends', async () => {
  const w = await world(); await w.bill();
  // Bill created at 21:00: first reminder is deferred to 10:00 the day after tomorrow.
  expect(await w.alarm()).toBe(Date.parse('2026-11-09T05:00:00Z'));
  for (let i = 0; i < 3; i++) {
    now = (await w.alarm())!; await w.flush();
    expect(w.reminders()).toHaveLength(i + 1);
    await w.stub.request(w.ev, { parts: ['bill'] }); await w.flush();
    expect(w.reminders()).toHaveLength(i + 1);
  }
  expect(await w.alarm()).toBeNull();
});

test('manual reminder postpones the automatic delivery for a full 24 hours', async () => {
  const w = await world(); const billId = await w.bill();
  const due = (await w.alarm())!;
  now = due - HOUR;
  await w.stub.request(w.ev, { parts: [], notices: [{ kind: 'reminder', billId }] }); await w.flush();
  expect(w.reminders()).toHaveLength(1);
  expect(await w.alarm()).toBe(Date.parse('2026-11-10T05:00:00Z'));
  now = due; await w.flush();
  expect(w.reminders()).toHaveLength(1);
});

test.each(['paid', 'closed', 'disabled', 'unavailable', 'not_member'] as const)('automatic payment stops when %s and never falls back to group', async reason => {
  const w = await world(); const billId = await w.bill();
  const due = (await w.alarm())!;
  if (reason === 'paid') await markPaid(w.d, billId, w.payer.id, w.payer.id);
  if (reason === 'closed') await closeBill(w.d, billId);
  if (reason === 'disabled') await setMemberProfile(w.payer.id, { notificationsEnabled: false });
  if (reason === 'unavailable') await setMemberProfile(w.payer.id, { pmAvailable: false });
  if (reason === 'not_member') tg.members.delete(w.payer.tgId);
  now = due; await w.flush();
  expect(w.reminders()).toHaveLength(0);
  expect(tg.sent.filter(m => m.html.includes('Напоминание об оплате'))).toHaveLength(0);
  expect(await w.alarm()).toBeNull();
});

test('a historical bill arms from current sync time instead of immediately notifying', async () => {
  const w = await world(); await w.bill();
  await runInDurableObject(w.stub, async (_i, s) => { await s.storage.deleteAll(); });
  now = Date.parse('2026-11-20T05:00:00Z');
  await w.stub.request(w.ev, { parts: ['bill'] }); await w.flush();
  expect(w.reminders()).toHaveLength(0);
  expect(await w.alarm()).toBe(now + DAY);
});

test('finish invites actual unsubmitted account participants once, with direct review link and deadline', async () => {
  const w = await world();
  await addGuest(w.d, w.ev, w.payer.id, 'Друг');
  await w.finish();
  expect(w.personal()).toHaveLength(0); // 22:00, wait until morning
  expect(await w.alarm()).toBe(Date.parse('2026-11-08T05:00:00Z'));
  now = (await w.alarm())!; await w.flush();
  const invites = () => w.personal().filter(m => m.html.includes('Оцени игру'));
  expect(invites()).toHaveLength(1);
  expect(invites()[0].html).toContain('10 ноября');
  expect(invites()[0].keyboard?.inline_keyboard[0][0]).toMatchObject({ text: 'Оценить игру', url: expect.stringContaining(`startapp=r${w.ev}`) });
  await w.stub.request(w.ev, { parts: [], review: true }); await w.flush();
  expect(invites()).toHaveLength(1);
  expect(await w.alarm()).toBeNull();
});

test.each(['submitted', 'skipped', 'expired', 'disabled', 'not_member'] as const)('review invitation skips %s and has no group fallback', async reason => {
  const w = await world(); await w.finish();
  if (reason === 'submitted' || reason === 'skipped') {
    await submitReview(w.d, (await getEvent(db(), w.ev))!, w.payer.id, { scores: [], gameScore: reason === 'skipped' ? null : 7, skipped: reason === 'skipped' });
  }
  if (reason === 'disabled') await setMemberProfile(w.payer.id, { notificationsEnabled: false });
  if (reason === 'not_member') tg.members.delete(w.payer.tgId);
  now = reason === 'expired' ? now + 3 * DAY : (await w.alarm())!;
  await w.flush();
  expect(w.personal()).toHaveLength(0);
  expect(tg.sent.some(m => m.chatId < 0 && m.html.includes('Оцени игру'))).toBe(false);
  expect(await w.alarm()).toBeNull();
});

test('automatic 429 persists retry_after and does not spend a successful payment attempt', async () => {
  const w = await world(); await w.bill(); now = (await w.alarm())!;
  tg.failNextWith = new TgRateLimited(90);
  await w.flush();
  expect(w.reminders()).toHaveLength(0);
  expect(await w.alarm()).toBe(now + 90_000);
  now += 90_000; await w.flush();
  expect(w.reminders()).toHaveLength(1);
  expect(await w.alarm()).toBe(now + DAY);
});

test('a blocked automatic private destination is terminal and never mentioned in the group', async () => {
  const w = await world(); await w.matchSync(); now = KICKOFF - 2 * HOUR;
  tg.failNextWith = new TgForbidden('blocked');
  await w.flush();
  expect(w.personal()).toHaveLength(0);
  expect((await db().select().from(users).where(eq(users.id, w.payer.id)))[0].pmAvailable).toBe(false);
  expect(await w.alarm()).toBe(KICKOFF);
});

test('rebinding the community never sends old automatic work to the new group', async () => {
  const w = await world(); await w.matchSync();
  await db().update(communities).set({ tgChatId: -999 }).where(eq(communities.id, w.community.id));
  now = KICKOFF - 2 * HOUR; await w.flush();
  expect(w.personal()).toHaveLength(0);
  expect(await w.alarm()).toBeNull();
});
