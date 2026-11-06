import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { communities } from '../../src/db/schema';
import { bindCommunity, ensureMembership } from '../../src/domain/members';
import { createEvent, joinEvent, loadQueue, scheduleEvent } from '../../src/domain/events';
import { upsertBill } from '../../src/domain/bills';
import { __setTgClientForTests } from '../../src/telegram/client';
import { FakeTg } from '../fakes/fakeTg';
import { FakeSync } from '../fakes/fakeSync';
import { db, seedUser, setMemberProfile } from '../helpers';
import { groupCommand, makeTestBot } from '../bot/helpers';
import { doSyncPort } from '../../src/sync/port';

afterEach(() => __setTgClientForTests(null));

test('two-team delivery uses each match chat, local receiver and local subscription', async () => {
  const a = await bindCommunity(db(), -101, 'Субботняя команда');
  const b = await bindCommunity(db(), -102, 'Рабочая команда');
  const payer = await seedUser('Общий игрок', { tgId: 501, communityId: a.id });
  await ensureMembership(db(), b.id, payer.id, Date.now());
  await setMemberProfile(payer.id, { notificationsEnabled: true, pmAvailable: true });
  const tg = new FakeTg();
  tg.members.add(payer.tgId);
  __setTgClientForTests(tg);
  const d = { db: db(), now: 1, sync: new FakeSync() };
  const make = async (c: typeof a, phone: string, fieldAmount: number) => {
    const org = await seedUser(`Получатель ${c.id}`, { communityId: c.id });
    await setMemberProfile(org.id, { kaspiPhone: phone });
    const eventId = await createEvent(d, { communityId: c.id, date: '2026-12-01', comment: null, createdBy: org.id });
    await joinEvent(d, eventId, org.id); await joinEvent(d, eventId, payer.id);
    await scheduleEvent(d, eventId, { startTime: '21:00', durationHours: 1, place: c.title });
    const result = await upsertBill({ ...d, now: Date.parse('2026-12-01T16:00:00Z') }, eventId, { receiverUserId: org.id, fieldAmount, extras: [], participantSignupIds: (await loadQueue(db(), eventId)).main.map(s => s.id) });
    expect(result.kind).toBe('ok');
    const stub = env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${eventId}`));
    return { eventId, stub, sync: async () => { await stub.request(eventId, { parts: ['bill'] }); await runDurableObjectAlarm(stub); } };
  };
  const ea = await make(a, '+77011234567', 4000);
  const eb = await make(b, '+77017654321', 8000);
  await ea.sync(); await eb.sync();
  expect(tg.sent.filter(m => m.chatId === -101)).toHaveLength(1);
  expect(tg.sent.filter(m => m.chatId === -102)).toHaveLength(1);
  const first = tg.sent.filter(m => m.chatId === 501);
  // One shared subscription: each team's payment reaches the person with that team's receiver.
  expect(first).toHaveLength(2);
  const ma = first.find(m => m.html.includes(a.title))!;
  const mb = first.find(m => m.html.includes(b.title))!;
  expect(ma.html).not.toContain(b.title);
  expect(ma.keyboard?.inline_keyboard.flat()).toContainEqual(expect.objectContaining({ copy_text: { text: '+77011234567' } }));
  expect(mb.keyboard?.inline_keyboard.flat()).toContainEqual(expect.objectContaining({ copy_text: { text: '+77017654321' } }));
  await db().update(communities).set({ active: false }).where(eq(communities.id, b.id));
  const sent = tg.sent.length;
  const edited = tg.edited.length;
  await eb.sync();
  expect(tg.sent).toHaveLength(sent);
  expect(tg.edited).toHaveLength(edited);
});

test('a consumed alarm resumes after verified bot reconnection without duplicate reminders', async () => {
  const kickoff = Date.parse('2026-12-01T16:00:00Z');
  let now = kickoff - 3 * 3600_000;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const c = await bindCommunity(db(), -101, 'Команда');
    const u = await seedUser('Игрок', { tgId: 501, communityId: c.id });
    await setMemberProfile(u.id, { notificationsEnabled: true, pmAvailable: true });
    const tg = new FakeTg(); tg.members.add(501); __setTgClientForTests(tg);
    const d = { db: db(), now, sync: new FakeSync() };
    const event = await createEvent(d, { communityId: c.id, createdBy: u.id, date: '2026-12-01', comment: null });
    await joinEvent(d, event, u.id);
    await scheduleEvent(d, event, { startTime: '21:00', durationHours: 1, place: 'Поле' });
    const stub = env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${event}`));
    await stub.request(event, { parts: ['event'] });
    await runDurableObjectAlarm(stub);
    await db().update(communities).set({ active: false }).where(eq(communities.id, c.id));
    now = kickoff - 2 * 3600_000;
    await runDurableObjectAlarm(stub);
    expect(await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm())).toBeNull();
    expect(tg.sent.filter(m => m.chatId === 501)).toHaveLength(0);
    const t = makeTestBot(() => now);
    const sync = doSyncPort(env);
    t.sync.request = (id, req) => sync.request(id, req);
    await t.bot.handleUpdate(groupCommand(1, '/bind', -101));
    expect(await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm())).not.toBeNull();
    await runDurableObjectAlarm(stub);
    expect(tg.sent.filter(m => m.chatId === 501 && m.html.includes('Скоро матч'))).toHaveLength(1);
    await runDurableObjectAlarm(stub);
    expect(tg.sent.filter(m => m.chatId === 501 && m.html.includes('Скоро матч'))).toHaveLength(1);
  } finally { clock.mockRestore(); }
});
