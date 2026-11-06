import { SELF } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { events, memberships } from '../../src/db/schema';
import { createEvent, loadQueue } from '../../src/domain/events';
import { communityByChat, getCommunity } from '../../src/domain/members';
import { FakeSync } from '../fakes/fakeSync';
import { db, seedCommunity, seedUser } from '../helpers';
import { groupCommand, makeTestBot, migrated, privateCommand, tap } from './helpers';
import { __setTgClientForTests } from '../../src/telegram/client';
import { FakeTg } from '../fakes/fakeTg';

let ev: number;

afterEach(() => __setTgClientForTests(null));

beforeEach(async () => {
  const tg = new FakeTg(); tg.members.add(501); __setTgClientForTests(tg);
  const c = await seedCommunity();
  const org = await seedUser('Орг', { communityId: c.id, role: 'organizer' });
  ev = await createEvent({ db: db(), now: 1, sync: new FakeSync() }, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: org.id });
});

test('j: answers with position and records signup', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, `j:${ev}`));
  expect(t.answers()).toEqual(['Ты в основе · место 1']);
  expect((await loadQueue(db(), ev)).main).toHaveLength(1);
  expect(t.sync.calls.at(-1)).toEqual({ eventId: ev, req: { parts: ['event'] } });
});

test('double tap on j: answers "already" and keeps one signup', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, `j:${ev}`));
  await t.bot.handleUpdate(tap(501, `j:${ev}`));
  expect(t.answers()[1]).toBe('Ты уже в основе · место 1');
  expect((await loadQueue(db(), ev)).main).toHaveLength(1);
});

test('l: answers with restore hint, then not_in', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, `j:${ev}`));
  await t.bot.handleUpdate(tap(501, `l:${ev}`));
  await t.bot.handleUpdate(tap(501, `l:${ev}`));
  expect(t.answers()[1]).toContain('В течение 2 минут');
  expect(t.answers()[2]).toBe('Тебя нет в списке');
});

test('unknown callback gets an empty answer', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, 'zzz'));
  expect(t.calls.map(c => c.method)).toEqual(['answerCallbackQuery']);
});

test('/bind checks the group admin and creates another team', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(groupCommand(2, '/bind'));
  expect(await communityByChat(db(), -100777)).toBeNull();
  await t.bot.handleUpdate(groupCommand(1, '/bind'));
  expect((await communityByChat(db(), -100500))!.tgChatId).toBe(-100500);
  expect((await communityByChat(db(), -100777))!.tgChatId).toBe(-100777);
});

test('/start in private offers onboarding to a new identity', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/start'));
  const msg = t.calls.find(c => c.method === 'sendMessage')!;
  expect(msg.payload.text).toContain('/bind');
  expect(JSON.stringify(msg.payload.reply_markup)).toContain('startgroup=connect');
});

test('webhook rejects wrong secret', async () => {
  const res = await SELF.fetch('https://x/tg/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': 'nope', 'content-type': 'application/json' },
    body: '{}',
  });
  expect(res.status).toBe(401);
});

test('a button from another chat is ignored', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, `j:${ev}`, 'Арман', -100999));
  expect(t.answers()).toEqual(['Этот сбор ведётся в другой группе']);
  expect((await loadQueue(db(), ev)).main).toHaveLength(0);
});

test('connecting a group does not require closing another team matches', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(groupCommand(1, '/bind'));
  expect(await communityByChat(db(), -100500)).not.toBeNull();
  expect(await communityByChat(db(), -100777)).not.toBeNull();
  expect((await db().select().from(events).where(eq(events.id, ev)))[0].status).toBe('collecting');
});

test('group upgraded to a supergroup moves the binding', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(migrated(-100500, -100123));
  expect((await getCommunity(db()))!.tgChatId).toBe(-100123);
});
