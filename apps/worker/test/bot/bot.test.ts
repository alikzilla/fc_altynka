import { SELF } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { events, memberships } from '../../src/db/schema';
import { createEvent, loadQueue } from '../../src/domain/events';
import { getCommunity } from '../../src/domain/members';
import { FakeSync } from '../fakes/fakeSync';
import { db, seedCommunity, seedUser } from '../helpers';
import { groupCommand, makeTestBot, migrated, privateCommand, tap } from './helpers';

let ev: number;

beforeEach(async () => {
  const c = await seedCommunity();
  const org = await seedUser('Орг', { communityId: c.id, role: 'organizer' });
  ev = await createEvent({ db: db(), now: 1, sync: new FakeSync() }, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: org.id });
});

test('j: answers with position and records signup', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, `j:${ev}`));
  expect(t.answers()).toEqual(['Записал ✅ Ты №1 в основе']);
  expect((await loadQueue(db(), ev)).main).toHaveLength(1);
  expect(t.sync.calls.at(-1)).toEqual({ eventId: ev, req: { parts: ['event'] } });
});

test('double tap on j: answers "already" and keeps one signup', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, `j:${ev}`));
  await t.bot.handleUpdate(tap(501, `j:${ev}`));
  expect(t.answers()[1]).toBe('Ты уже в списке, №1');
  expect((await loadQueue(db(), ev)).main).toHaveLength(1);
});

test('l: answers with restore hint, then not_in', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, `j:${ev}`));
  await t.bot.handleUpdate(tap(501, `l:${ev}`));
  await t.bot.handleUpdate(tap(501, `l:${ev}`));
  expect(t.answers()[1]).toContain('в течение 2 минут');
  expect(t.answers()[2]).toBe('Тебя нет в списке');
});

test('unknown callback gets an empty answer', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, 'zzz'));
  expect(t.calls.map(c => c.method)).toEqual(['answerCallbackQuery']);
});

test('/bind from admin binds group, from others is ignored', async () => {
  await db().update(events).set({ status: 'cancelled' }).where(eq(events.id, ev));
  const t = makeTestBot();
  await t.bot.handleUpdate(groupCommand(2, '/bind'));
  expect((await getCommunity(db()))!.tgChatId).toBe(-100500);
  expect(t.calls).toHaveLength(0);
  await t.bot.handleUpdate(groupCommand(1, '/bind'));
  expect((await getCommunity(db()))!.tgChatId).toBe(-100777);
  expect(t.calls.find(c => c.method === 'sendMessage')!.payload.text).toBe('Группа привязана ✅');
});

test('/start in private replies with an open button', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/start'));
  const msg = t.calls.find(c => c.method === 'sendMessage')!;
  expect(JSON.stringify(msg.payload.reply_markup)).toContain('https://t.me/fc_altynka_bot/app');
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

test('/bind to another chat is refused while events are open', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(groupCommand(1, '/bind'));
  expect((await getCommunity(db()))!.tgChatId).toBe(-100500);
  const text = t.calls.find(c => c.method === 'sendMessage')!.payload.text as string;
  expect(text).toContain('Сначала');
  expect(text).toContain('7 ноября');
});

test('rebinding to another chat makes everyone re-confirm membership', async () => {
  await db().update(events).set({ status: 'cancelled' }).where(eq(events.id, ev));
  const t = makeTestBot();
  await t.bot.handleUpdate(groupCommand(1, '/bind'));
  const rows = await db().select().from(memberships);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(m => m.checkedAt === 0)).toBe(true);
});

test('group upgraded to a supergroup moves the binding', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(migrated(-100500, -100123));
  expect((await getCommunity(db()))!.tgChatId).toBe(-100123);
});
