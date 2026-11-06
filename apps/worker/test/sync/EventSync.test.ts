import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { events } from '../../src/db/schema';
import { createEvent, joinEvent, leaveEvent, loadQueue, scheduleEvent, type Deps } from '../../src/domain/events';
import { __setTgClientForTests, TgRateLimited, TgRejected } from '../../src/telegram/client';
import { FakeSync } from '../fakes/fakeSync';
import { FakeTg } from '../fakes/fakeTg';
import { setMemberProfile, localUser, db, seedCommunity, seedUser } from '../helpers';

let tg: FakeTg;
let d: Deps & { sync: FakeSync };
let ev: number;

const stub = () => env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${ev}`));
const seedMember = async (name: string) => seedUser(name, { communityId: (await eventRow()).communityId });
const eventRow = async () => (await db().select().from(events).where(eq(events.id, ev)))[0];

beforeEach(async () => {
  tg = new FakeTg();
  __setTgClientForTests(tg);
  d = { db: db(), now: Date.now(), sync: new FakeSync() };
  const c = await seedCommunity();
  const org = await seedUser('Орг', { communityId: c.id, role: 'organizer' });
  ev = await createEvent(d, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: org.id });
  await d.db.update(events).set({protocolVersion:0}).where(eq(events.id,ev));
});
afterEach(() => __setTgClientForTests(null));

test('first sync sends and pins, next edits', async () => {
  await stub().request(ev, { parts: ['event'] });
  expect(await runDurableObjectAlarm(stub())).toBe(true);
  expect(tg.sent).toHaveLength(1);
  expect(tg.sent[0]).toMatchObject({ chatId: -100500 });
  expect(tg.sent[0].html).toContain('суббота, 7 ноября');
  expect(tg.pinned).toEqual([{ chatId: -100500, messageId: tg.sent[0].messageId }]);
  expect((await eventRow()).eventMessageId).toBe(tg.sent[0].messageId);
  await stub().request(ev, { parts: ['event'] });
  await runDurableObjectAlarm(stub());
  expect(tg.sent).toHaveLength(1);
  expect(tg.edited).toHaveLength(1);
});

test('kickoff alarm refreshes the Telegram card and removes signup buttons', async () => {
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: null });
  await stub().request(ev, { parts: ['event'] });
  await runDurableObjectAlarm(stub());
  const kickoff = Date.parse('2026-11-07T16:00:00Z');
  expect(await runInDurableObject(stub(), (_i, st) => st.storage.getAlarm())).toBe(kickoff);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(kickoff);
  try {
    await runDurableObjectAlarm(stub());
    expect(tg.edited.at(-1)!.html).toContain('Игра началась');
    expect(JSON.stringify(tg.edited.at(-1)!.keyboard)).not.toContain('callback_data');
    expect(await runInDurableObject(stub(), (_i, st) => st.storage.getAlarm())).toBeNull();
  } finally { clock.mockRestore(); }
});

test('manual session does not schedule automatic kickoff or close Telegram registration at appointment', async () => {
  await d.db.update(events).set({protocolVersion:1}).where(eq(events.id,ev));
  await scheduleEvent(d,ev,{startTime:'21:00',durationHours:1,place:null});
  await stub().request(ev,{parts:['event']}); await runDurableObjectAlarm(stub());
  expect(await runInDurableObject(stub(),(_i,state)=>state.storage.getAlarm())).toBeNull();
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-11-07T17:00:00Z'));
  try {
    await stub().request(ev,{parts:['event']}); await runDurableObjectAlarm(stub());
    const message=tg.edited.at(-1)!;
    expect(message.html).not.toContain('Игра началась');
    expect(JSON.stringify(message.keyboard)).toContain(`j:${ev}`);
  } finally { clock.mockRestore(); }
});

test('signup updates do not wait for a future kickoff and do not bypass a Telegram retry', async () => {
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: null });
  await stub().request(ev, { parts: ['event'] }); await runDurableObjectAlarm(stub());
  await stub().request(ev, { parts: ['event'] });
  const alarm = await runInDurableObject(stub(), (_i, st) => st.storage.getAlarm());
  expect(alarm as number).toBeLessThan(Date.now() + 10_000);
  tg.failNextWith = new TgRateLimited(30);
  await runDurableObjectAlarm(stub());
  const retry = await runInDurableObject(stub(), (_i, st) => st.storage.getAlarm());
  await stub().request(ev, { parts: ['event'] });
  expect(await runInDurableObject(stub(), (_i, st) => st.storage.getAlarm())).toBe(retry);
});

test('many requests within the window schedule one alarm and one edit', async () => {
  await stub().request(ev, { parts: ['event'] });
  await runDurableObjectAlarm(stub());
  for (let i = 0; i < 15; i++) await stub().request(ev, { parts: ['event'] });
  const alarm = await runInDurableObject(stub(), (_i, state) => state.storage.getAlarm());
  expect(alarm).not.toBeNull();
  await runDurableObjectAlarm(stub());
  expect(tg.edited).toHaveLength(1);
});

test('429 keeps work and reschedules by retry_after', async () => {
  tg.failNextWith = new TgRateLimited(5);
  await stub().request(ev, { parts: ['event'] });
  const before = Date.now();
  await runDurableObjectAlarm(stub());
  expect(tg.sent).toHaveLength(0);
  const [dirty, alarm] = await runInDurableObject(stub(), async (_i, state) => [
    await state.storage.get('dirty'),
    await state.storage.getAlarm(),
  ]);
  expect(dirty).toEqual(['event']);
  expect(alarm as number).toBeGreaterThanOrEqual(before + 4000);
  await runDurableObjectAlarm(stub());
  expect(tg.sent).toHaveLength(0);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(alarm as number);
  try {
    await runDurableObjectAlarm(stub());
    expect(tg.sent).toHaveLength(1);
  } finally { clock.mockRestore(); }
});

test('promotion notice is a reply to the event message and mentions the user', async () => {
  await stub().request(ev, { parts: ['event'] });
  await runDurableObjectAlarm(stub());
  const us = await Promise.all(Array.from({ length: 11 }, (_, i) => seedMember(`И${i + 1}`)));
  tg.members.add(us[10].tgId);
  for (const u of us) await joinEvent(d, ev, u.id);
  await leaveEvent(d, ev, us[0].id);
  await stub().request(ev, d.sync.calls.at(-1)!.req);
  await runDurableObjectAlarm(stub());
  const notice = tg.sent.at(-1)!;
  expect(notice.replyTo).toBe(tg.sent[0].messageId);
  expect(notice.html).toContain(`tg://user?id=${us[10].tgId}`);
  expect((await loadQueue(db(), ev)).main.map(s => s.userId)).toContain(us[10].id);
});

test('deleted event message is re-sent', async () => {
  await db().update(events).set({ eventMessageId: 42 }).where(eq(events.id, ev));
  const { TgMessageGone } = await import('../../src/telegram/client');
  tg.failNextWith = new TgMessageGone('message to edit not found');
  await stub().request(ev, { parts: ['event'] });
  await runDurableObjectAlarm(stub());
  expect(tg.sent).toHaveLength(1);
  expect((await eventRow()).eventMessageId).toBe(tg.sent[0].messageId);
});

test('reminder notice lists debtors with amounts due', async () => {
  const { upsertBill } = await import('../../src/domain/bills');
  const { users } = await import('../../src/db/schema');
  await stub().request(ev, { parts: ['event'] });
  await runDurableObjectAlarm(stub());
  const [a, b] = await Promise.all([seedMember('Азамат'), seedMember('Тимур')]);
  tg.members.add(b.tgId);
  await setMemberProfile(a.id, { kaspiPhone: '+77071234567' });
  await joinEvent(d, ev, a.id);
  await joinEvent(d, ev, b.id);
  const { scheduleEvent } = await import('../../src/domain/events');
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: null });
  const ids = (await loadQueue(db(), ev)).main.map(s => s.id);
  const r = (await upsertBill({ ...d, now: Date.parse('2026-11-07T16:00:00Z') }, ev, { receiverUserId: a.id, fieldAmount: 4000, extras: [], participantSignupIds: ids })) as { billId: number };
  await stub().request(ev, { parts: ['bill'], notices: [{ kind: 'reminder', billId: r.billId }] });
  await runDurableObjectAlarm(stub());
  const billMsg = tg.sent.find(m => m.html.includes('<b>Оплата'))!;
  expect(billMsg.replyTo).toBe(tg.sent[0].messageId);
  const reminder = tg.sent.at(-1)!;
  expect(reminder.html).toContain('Напоминание');
  expect(reminder.html).toContain(`tg://user?id=${b.tgId}`);
  expect(reminder.html).not.toContain(`tg://user?id=${a.tgId}`);
  expect(reminder.html).not.toContain('2 000 ₸');
});

/** Подменяет метод FakeTg: первый вызов ждёт release(), чтобы request() успел влезть посреди alarm. */
function holdFirst(method: 'editMessage' | 'sendMessage') {
  let release!: () => void;
  let started!: () => void;
  const startedP = new Promise<void>(r => (started = r));
  const gate = new Promise<void>(r => (release = r));
  const orig = tg[method].bind(tg) as (...a: unknown[]) => Promise<never>;
  let held = false;
  (tg as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
    if (!held) {
      held = true;
      started();
      await gate;
    }
    return orig(...args);
  };
  return { startedP, release, restore: () => ((tg as unknown as Record<string, unknown>)[method] = orig) };
}

test('a join that lands while the alarm is editing is not lost', async () => {
  await stub().request(ev, { parts: ['event'] });
  await runDurableObjectAlarm(stub());
  const [a, b] = await Promise.all([seedMember('Первый'), seedMember('Второй')]);
  await joinEvent(d, ev, a.id);
  await stub().request(ev, { parts: ['event'] });
  const h = holdFirst('editMessage');
  const alarmP = runDurableObjectAlarm(stub());
  await h.startedP;
  await joinEvent(d, ev, b.id);
  await stub().request(ev, { parts: ['event'] });
  h.release();
  await alarmP;
  h.restore();
  await runDurableObjectAlarm(stub());
  expect(tg.edited.at(-1)!.html).toContain('Второй');
});

test('a promotion queued while another notice is being sent is still sent', async () => {
  await stub().request(ev, { parts: ['event'] });
  await runDurableObjectAlarm(stub());
  const us = await Promise.all(Array.from({ length: 12 }, (_, i) => seedMember(`И${i + 1}`)));
  tg.members.add(us[10].tgId);
  tg.members.add(us[11].tgId);
  for (const u of us) await joinEvent(d, ev, u.id);
  await leaveEvent(d, ev, us[0].id); // И11 в основу
  await stub().request(ev, d.sync.calls.at(-1)!.req);
  const h = holdFirst('sendMessage');
  const alarmP = runDurableObjectAlarm(stub());
  await h.startedP;
  await leaveEvent(d, ev, us[1].id); // И12 в основу
  await stub().request(ev, d.sync.calls.at(-1)!.req);
  h.release();
  await alarmP;
  h.restore();
  await runDurableObjectAlarm(stub());
  const notices = tg.sent.filter(m => m.html.includes('В основе'));
  expect(notices.some(n => n.html.includes(`tg://user?id=${us[11].tgId}`))).toBe(true);
});

test('a part Telegram rejects is dropped and does not block notices', async () => {
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: null });
  await stub().request(ev, { parts: ['event'] });
  await runDurableObjectAlarm(stub());
  tg.failNextWith = new TgRejected('Bad Request: something permanent');
  await stub().request(ev, { parts: ['event'], notices: [{ kind: 'scheduled' }] });
  await runDurableObjectAlarm(stub());
  expect(tg.sent.at(-1)!.html).toContain('Игра назначена');
  expect(await runInDurableObject(stub(), (_i, st) => st.storage.get('dirty'))).toEqual([]);
});

test('a network error keeps the part for a retry and still sends notices', async () => {
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: null });
  await stub().request(ev, { parts: ['event'] });
  await runDurableObjectAlarm(stub());
  tg.failNextWith = new Error('network down');
  await stub().request(ev, { parts: ['event'], notices: [{ kind: 'scheduled' }] });
  await runDurableObjectAlarm(stub()).catch(() => {});
  expect(tg.sent.at(-1)!.html).toContain('Игра назначена');
  expect(await runInDurableObject(stub(), (_i, st) => st.storage.get('dirty'))).toEqual(['event']);
});
