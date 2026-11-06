import { and, eq } from 'drizzle-orm';
import { communities, memberships } from '../../src/db/schema';
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

test('private selection and subscription changes are explicit and local to one team', async () => {
  const a = await bindCommunity(db(), -101, 'Команда A');
  const b = await bindCommunity(db(), -102, 'Команда B');
  const u = await seedUser('Общий игрок', { tgId: 501, communityId: a.id, role: 'organizer' });
  await ensureMembership(db(), b.id, u.id, Date.now());
  tg.members.add(501);
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/matches'));
  const pick = t.calls.find(c => c.method === 'sendMessage')!;
  expect(pick.payload.text).toBe('Выбери команду:');
  expect(JSON.stringify(pick.payload.reply_markup)).toContain(`team:${a.id}:matches`);
  expect(JSON.stringify(pick.payload.reply_markup)).toContain(`team:${b.id}:matches`);
  const update = tap(501, `notify:${b.id}:1`, 'Общий игрок', 501);
  update.callback_query!.message!.chat.type = 'private';
  await t.bot.handleUpdate(update);
  const rows = await db().select().from(memberships).where(eq(memberships.userId, u.id));
  expect(rows.find(m => m.communityId === a.id)?.notificationsEnabled).toBe(false);
  expect(rows.find(m => m.communityId === b.id)?.notificationsEnabled).toBe(true);
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
