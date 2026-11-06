import { and, eq } from 'drizzle-orm';
import { billLines, bills, communities, events, memberships, users } from '../../src/db/schema';
import { bindCommunity, ensureMembership } from '../../src/domain/members';
import { createEvent, loadQueue } from '../../src/domain/events';
import { FakeSync } from '../fakes/fakeSync';
import { FakeTg } from '../fakes/fakeTg';
import { __setTgClientForTests } from '../../src/telegram/client';
import { db, seedUser } from '../helpers';
import { groupCommand, makeTestBot, privateCommand, tap } from './helpers';
import type { Update } from 'grammy/types';

let tg: FakeTg;
beforeEach(() => { tg = new FakeTg(); __setTgClientForTests(tg); });
afterEach(() => __setTgClientForTests(null));

test('any confirmed admin can connect a group without moving another group', async () => {
  const a = await bindCommunity(db(), -101, 'A');
  const t = makeTestBot();
  t.admins.add(77);
  await t.bot.handleUpdate(groupCommand(77, '/bind', -102));
  await t.bot.handleUpdate(groupCommand(77, '/bind', -102));
  const rows = await db().select().from(communities);
  expect(rows).toHaveLength(2);
  expect(rows.find(c => c.id === a.id)?.tgChatId).toBe(-101);
  expect(t.calls.filter(c => c.method === 'sendMessage').every(c => String(c.payload.text).includes('Группа привязана'))).toBe(true);
});

test('/matches merges matches of all groups and labels them only with several groups', async () => {
  const a = await bindCommunity(db(), -101, 'Команда A');
  const b = await bindCommunity(db(), -102, 'Команда B');
  const u = await seedUser('Общий игрок', { tgId: 501, communityId: a.id });
  await ensureMembership(db(), b.id, u.id, Date.now());
  await db().insert(events).values([
    { communityId: a.id, date: '2026-11-07', place: 'Поле один', createdBy: u.id, createdAt: 0 },
    { communityId: b.id, date: '2026-11-08', place: 'Поле два', createdBy: u.id, createdAt: 0 },
  ]);
  tg.members.add(501);
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/matches'));
  const sent = t.calls.filter(c => c.method === 'sendMessage');
  expect(sent).toHaveLength(1);
  expect(sent[0].payload.text).toContain('Поле один · Команда A');
  expect(sent[0].payload.text).toContain('Поле два · Команда B');
  expect(JSON.stringify(sent[0].payload.reply_markup)).not.toContain('team:');
  // A single-group member sees no group titles.
  const solo = await seedUser('Один', { tgId: 502, communityId: a.id });
  tg.members.add(502);
  const t2 = makeTestBot();
  await t2.bot.handleUpdate(privateCommand(502, '/matches'));
  const text = String(t2.calls.find(c => c.method === 'sendMessage')!.payload.text);
  expect(text).toContain('Поле один');
  expect(text).not.toContain('Команда A');
  expect(solo.id).toBeGreaterThan(0);
});

test('/payments lists debts of every group, including one the person left', async () => {
  const a = await bindCommunity(db(), -101, 'Команда A');
  const b = await bindCommunity(db(), -102, 'Команда B');
  const u = await seedUser('Общий игрок', { tgId: 501, communityId: a.id });
  const other = await seedUser('Другой', { communityId: a.id });
  await ensureMembership(db(), b.id, u.id, Date.now());
  for (const [c, date, amount] of [[a, '2026-11-07', 1000], [b, '2026-11-08', 2000]] as const) {
    const [ev] = await db().insert(events).values({ communityId: c.id, date, createdBy: other.id, createdAt: 0, status: 'billing' }).returning();
    const [bill] = await db().insert(bills).values({ eventId: ev.id, receiverUserId: other.id, fieldAmount: 1, share: 1, createdAt: 0 }).returning();
    await db().insert(billLines).values({ billId: bill.id, userId: u.id, units: 1, amount });
  }
  tg.members.add(501);
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/payments'));
  let text = String(t.calls.find(c => c.method === 'sendMessage')!.payload.text);
  expect(text).toContain('1 000 ₸ · Команда A');
  expect(text).toContain('2 000 ₸ · Команда B');
  // Leave group B: the debt stays visible, and titles stay because debts span two groups.
  tg.chatMembers.set(-101, new Set([501]));
  tg.chatMembers.set(-102, new Set());
  const left = makeTestBot();
  await left.bot.handleUpdate(privateCommand(501, '/payments'));
  text = String(left.calls.find(c => c.method === 'sendMessage')!.payload.text);
  expect(text).toContain('Команда B');
});

test('/settings needs no group choice and notify toggles the personal flag', async () => {
  const a = await bindCommunity(db(), -101, 'Команда A');
  const b = await bindCommunity(db(), -102, 'Команда B');
  const u = await seedUser('Общий игрок', { tgId: 501, communityId: a.id, role: 'organizer' });
  await ensureMembership(db(), b.id, u.id, Date.now());
  tg.members.add(501);
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/settings'));
  const msg = t.calls.find(c => c.method === 'sendMessage')!;
  expect(msg.payload.text).not.toBe('Выбери команду:');
  expect(JSON.stringify(msg.payload.reply_markup)).toContain('"notify:1"');
  const update = tap(501, 'notify:1', 'Общий игрок', 501);
  update.callback_query!.message!.chat.type = 'private';
  await t.bot.handleUpdate(update);
  expect((await db().select().from(users).where(eq(users.id, u.id)))[0].notificationsEnabled).toBe(true);
  // Legacy buttons with a group id still work and the id is ignored.
  const legacy = tap(501, `notify:${b.id}:0`, 'Общий игрок', 501);
  legacy.callback_query!.message!.chat.type = 'private';
  await t.bot.handleUpdate(legacy);
  expect((await db().select().from(users).where(eq(users.id, u.id)))[0].notificationsEnabled).toBe(false);
});

test('/newmatch opens the app for an organizer anywhere, otherwise explains and offers to add the bot', async () => {
  const a = await bindCommunity(db(), -101, 'Команда A');
  const b = await bindCommunity(db(), -102, 'Команда B');
  const org = await seedUser('Орг', { tgId: 501, communityId: b.id, role: 'organizer' });
  await ensureMembership(db(), a.id, org.id, Date.now());
  await seedUser('Игрок', { tgId: 502, communityId: a.id });
  tg.members.add(501); tg.members.add(502);
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/newmatch'));
  expect(JSON.stringify(t.calls.find(c => c.method === 'sendMessage')!.payload.reply_markup)).toContain('startapp=newmatch');
  expect(JSON.stringify(t.calls.find(c => c.method === 'setMyCommands')!.payload.commands)).toContain('newmatch');
  const p = makeTestBot();
  await p.bot.handleUpdate(privateCommand(502, '/newmatch'));
  const reply = p.calls.find(c => c.method === 'sendMessage')!;
  expect(JSON.stringify(reply.payload.reply_markup)).toContain('startgroup=connect');
  expect(JSON.stringify(reply.payload.reply_markup)).not.toContain('startapp=newmatch');
  expect(JSON.stringify(p.calls.find(c => c.method === 'setMyCommands')!.payload.commands)).not.toContain('newmatch');
});

test('/start c<id>_matches from a chat member without membership creates it and asks no question', async () => {
  const a = await bindCommunity(db(), -101, 'Команда A');
  await seedUser('Свой', { tgId: 502, communityId: a.id });
  tg.members.add(501);
  const t = makeTestBot();
  const update = privateCommand(501, `/start c${a.id}_matches`);
  update.message!.entities![0].length = 6;
  await t.bot.handleUpdate(update);
  const [user] = await db().select().from(users).where(eq(users.tgId, 501));
  const [m] = await db().select().from(memberships).where(and(eq(memberships.communityId, a.id), eq(memberships.userId, user.id)));
  expect(m.active).toBe(true);
  const sent = t.calls.filter(c => c.method === 'sendMessage');
  expect(sent).toHaveLength(1);
  expect(sent[0].payload.text).not.toBe('Выбери команду:');
  expect(JSON.stringify(sent[0].payload.reply_markup)).toContain('startapp=matches');
});

test('member and bot lifecycle updates affect only their own team', async () => {
  const a = await bindCommunity(db(), -101, 'A');
  const b = await bindCommunity(db(), -102, 'B');
  const u = await seedUser('Общий игрок', { tgId: 501, communityId: a.id });
  await ensureMembership(db(), b.id, u.id, Date.now());
  const t = makeTestBot();
  const member = { id: 501, is_bot: false, first_name: 'Игрок' };
  await t.bot.handleUpdate({ update_id: 5100, chat_member: {
    chat: { id: -101, type: 'supergroup', title: 'A' }, from: member, date: 0,
    old_chat_member: { status: 'member', user: member }, new_chat_member: { status: 'left', user: member },
  } } as Update);
  const [ma] = await db().select().from(memberships).where(and(eq(memberships.communityId, a.id), eq(memberships.userId, u.id)));
  const [mb] = await db().select().from(memberships).where(and(eq(memberships.communityId, b.id), eq(memberships.userId, u.id)));
  expect(ma.active).toBe(false);
  expect(mb.active).toBe(true);
  await t.bot.handleUpdate({ update_id: 5101, my_chat_member: {
    chat: { id: -101, type: 'supergroup', title: 'A' }, from: member, date: 0,
    old_chat_member: { status: 'member', user: { ...member, id: 999, is_bot: true } },
    new_chat_member: { status: 'left', user: { ...member, id: 999, is_bot: true } },
  } } as Update);
  const groups = await db().select().from(communities);
  expect(groups.find(c => c.id === a.id)?.active).toBe(false);
  expect(groups.find(c => c.id === b.id)?.active).toBe(true);
});

test('verified reconnection rearms existing work without touching another team', async () => {
  const a = await bindCommunity(db(), -101, 'A');
  const b = await bindCommunity(db(), -102, 'B');
  const user = await seedUser('Орг', { communityId: a.id });
  const d = { db: db(), now: 1, sync: new FakeSync() };
  const eventA = await createEvent(d, { communityId: a.id, createdBy: user.id, date: '2026-12-01', comment: null });
  const eventB = await createEvent(d, { communityId: b.id, createdBy: user.id, date: '2026-12-01', comment: null });
  await db().update(communities).set({ active: false }).where(eq(communities.id, a.id));
  const t = makeTestBot();
  t.admins.add(77);
  await t.bot.handleUpdate(groupCommand(77, '/bind', -101));
  expect(t.sync.calls.some(c => c.eventId === eventA)).toBe(true);
  expect(t.sync.calls.some(c => c.eventId === eventB)).toBe(false);
});

test('ordinary or anonymous senders cannot bind; bot needs pin rights', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(groupCommand(77, '/bind', -102));
  expect(await db().select().from(communities)).toHaveLength(0);
  t.admins.add(77); t.rights.canPin = false;
  await t.bot.handleUpdate(groupCommand(77, '/bind', -102));
  expect(await db().select().from(communities)).toHaveLength(0);
});

test('forged callback from another bound chat cannot join the original match', async () => {
  const a = await bindCommunity(db(), -101, 'A');
  await bindCommunity(db(), -102, 'B');
  const u = await seedUser('Игрок', { communityId: a.id, tgId: 501 });
  const event = await createEvent({ db: db(), now: 1, sync: new FakeSync() }, { communityId: a.id, date: '2026-12-01', comment: null, createdBy: u.id });
  tg.members.add(501);
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, `j:${event}`, 'Игрок', -102));
  expect((await loadQueue(db(), event)).main).toHaveLength(0);
  expect(t.answers()).toEqual(['Этот сбор ведётся в другой группе']);
  await t.bot.handleUpdate(tap(501, `j:${event}`, 'Игрок', -101));
  expect((await loadQueue(db(), event)).main).toHaveLength(1);
});
