import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { events } from '../../src/db/schema';
import { createEvent, joinEvent, leaveEvent, loadQueue, type Deps } from '../../src/domain/events';
import { __setTgClientForTests, TgRateLimited } from '../../src/telegram/client';
import { FakeSync } from '../fakes/fakeSync';
import { FakeTg } from '../fakes/fakeTg';
import { db, seedCommunity, seedUser } from '../helpers';

let tg: FakeTg;
let d: Deps & { sync: FakeSync };
let ev: number;

const stub = () => env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${ev}`));
const eventRow = async () => (await db().select().from(events).where(eq(events.id, ev)))[0];

beforeEach(async () => {
  tg = new FakeTg();
  __setTgClientForTests(tg);
  d = { db: db(), now: Date.now(), sync: new FakeSync() };
  const c = await seedCommunity();
  const org = await seedUser('Орг', { communityId: c.id, role: 'organizer' });
  ev = await createEvent(d, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: org.id });
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
  expect(tg.sent).toHaveLength(1);
});

test('promotion notice is a reply to the event message and mentions the user', async () => {
  await stub().request(ev, { parts: ['event'] });
  await runDurableObjectAlarm(stub());
  const us = await Promise.all(Array.from({ length: 11 }, (_, i) => seedUser(`И${i + 1}`)));
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
