import { and, eq } from 'drizzle-orm';
import { bills, billLines, events, users } from '../../src/db/schema';
import { __setTgClientForTests } from '../../src/telegram/client';
import { FakeTg } from '../fakes/fakeTg';
import { db, seedCommunity, seedUser, localUser } from '../helpers';
import { groupCommand, makeTestBot, privateCommand, tap } from './helpers';

let tg: FakeTg;
beforeEach(() => { tg = new FakeTg(); __setTgClientForTests(tg); });
afterEach(() => __setTgClientForTests(null));
const texts = (t: ReturnType<typeof makeTestBot>) => t.calls.filter(c => c.method === 'sendMessage').map(c => c.payload.text).join('\n');
const privateTap = (id: number, data: string) => {
  const update = tap(id, data, 'Игрок', id);
  if (update.callback_query?.message) update.callback_query.message.chat = { id, type: 'private', first_name: 'Игрок' };
  return update;
};

test('/start proves private availability but notifications require an explicit toggle', async () => {
  const c = await seedCommunity();
  await seedUser('Игрок', { tgId: 501, communityId: c.id });
  tg.members.add(501);
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/start'));
  let [user] = await db().select().from(users).where(eq(users.tgId, 501));
  expect(user.pmAvailable).toBe(true);
  expect((await localUser(user.id)).notificationsEnabled).toBe(false);
  expect(texts(t)).toContain('Личные уведомления можно настроить отдельно');
  await t.bot.handleUpdate(privateTap(501, 'notify:1'));
  [user] = await db().select().from(users).where(eq(users.tgId, 501));
  expect((await localUser(user.id)).notificationsEnabled).toBe(true);
  await t.bot.handleUpdate(privateTap(501, 'notify:0'));
  [user] = await db().select().from(users).where(eq(users.tgId, 501));
  expect((await localUser(user.id)).notificationsEnabled).toBe(false);
});

test('a group notification callback cannot enable a personal subscription', async () => {
  await seedCommunity();
  const u = await seedUser('Игрок', { tgId: 501 });
  const t = makeTestBot();
  await t.bot.handleUpdate(tap(501, 'notify:1'));
  expect((await db().select().from(users).where(eq(users.id, u.id)))[0].notificationsEnabled).toBe(false);
});

test('old database membership alone cannot reveal matches or debts to a removed group member', async () => {
  const c = await seedCommunity();
  const user = await seedUser('Игрок', { tgId: 501, communityId: c.id, role: 'organizer' });
  await db().insert(events).values({ communityId: c.id, date: '2026-11-07', place: 'Секретное поле', createdBy: user.id, createdAt: 0 });
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/matches'));
  await t.bot.handleUpdate(privateCommand(501, '/payments'));
  await t.bot.handleUpdate(privateCommand(501, '/newmatch'));
  expect(texts(t)).toContain('участникам группы');
  expect(texts(t)).not.toContain('Секретное поле');
  expect(JSON.stringify(t.calls)).not.toContain('startapp=newmatch');
});

test('/payments shows only own remaining open obligations with event links', async () => {
  const c = await seedCommunity();
  const user = await seedUser('Игрок', { tgId: 501, communityId: c.id });
  const other = await seedUser('Другой', { communityId: c.id });
  const [event] = await db().insert(events).values({ communityId: c.id, date: '2026-11-07', createdBy: other.id, createdAt: 0, status: 'billing' }).returning();
  const [bill] = await db().insert(bills).values({ eventId: event.id, receiverUserId: other.id, fieldAmount: 12000, share: 2000, createdAt: 0 }).returning();
  await db().insert(billLines).values([
    { billId: bill.id, userId: user.id, units: 2, amount: 4000, paidAmount: 3000 },
    { billId: bill.id, userId: other.id, units: 1, amount: 9876 },
  ]);
  tg.members.add(501);
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/payments'));
  expect(texts(t)).toContain('1 000 ₸');
  expect(texts(t)).toContain('гост');
  expect(texts(t)).not.toContain('9876');
  expect(JSON.stringify(t.calls)).toContain(`startapp=b${event.id}`);
  await db().update(bills).set({ status: 'closed' }).where(and(eq(bills.id, bill.id)));
  const closed = makeTestBot();
  await closed.bot.handleUpdate(privateCommand(501, '/payments'));
  expect(texts(closed)).toContain('Нет открытых платежей');
});

test('/newmatch checks organizer role and installs a role-aware private menu', async () => {
  const c = await seedCommunity();
  await seedUser('Организатор', { tgId: 501, communityId: c.id, role: 'organizer' });
  await seedUser('Игрок', { tgId: 502, communityId: c.id });
  tg.members.add(501); tg.members.add(502);
  const org = makeTestBot();
  await org.bot.handleUpdate(privateCommand(501, '/newmatch'));
  expect(JSON.stringify(org.calls)).toContain('startapp=newmatch');
  expect(org.calls.find(c => c.method === 'setMyCommands')?.payload.scope).toEqual({ type: 'chat', chat_id: 501 });
  expect(JSON.stringify(org.calls.find(c => c.method === 'setMyCommands')?.payload.commands)).toContain('newmatch');
  const player = makeTestBot();
  await player.bot.handleUpdate(privateCommand(502, '/newmatch'));
  expect(texts(player)).toContain('организатор');
  expect(JSON.stringify(player.calls)).not.toContain('startapp=newmatch');
  expect(JSON.stringify(player.calls.find(c => c.method === 'setMyCommands')?.payload.commands)).not.toContain('newmatch');
});

test('newmatch private deep link checks role before opening the creation form', async () => {
  const c = await seedCommunity();
  await seedUser('Организатор', { tgId: 501, communityId: c.id, role: 'organizer' });
  tg.members.add(501);
  const t = makeTestBot();
  const update = privateCommand(501, '/start newmatch');
  if (update.message?.entities) update.message.entities[0].length = 6;
  await t.bot.handleUpdate(update);
  expect(JSON.stringify(t.calls.filter(c => c.method === 'sendMessage'))).toContain('startapp=newmatch');
});

test('/matches returns at most eight active matches in date order and escapes user content', async () => {
  const c = await seedCommunity();
  const u = await seedUser('Игрок', { tgId: 501, communityId: c.id });
  for (let day = 12; day >= 1; day--) {
    await db().insert(events).values({ communityId: c.id, date: `2026-11-${String(day).padStart(2, '0')}`, place: '<поле>', status: day === 1 ? 'cancelled' : 'scheduled', createdBy: u.id, createdAt: 0 });
  }
  tg.members.add(501);
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/matches'));
  const msg = t.calls.find(c => c.method === 'sendMessage')!;
  expect(texts(t)).toContain('&lt;поле&gt;');
  expect(texts(t)).not.toContain('1 ноября');
  expect(texts(t).indexOf('2 ноября')).toBeLessThan(texts(t).indexOf('9 ноября'));
  const markup = msg.payload.reply_markup as { inline_keyboard: { text: string; url: string }[][] };
  expect(markup.inline_keyboard.filter(row => row[0].url.includes('startapp=e'))).toHaveLength(8);
  expect(markup.inline_keyboard.at(-1)?.[0].url).toContain('startapp=matches');
});

test('group personal commands redirect to private and ordinary conversation is ignored', async () => {
  const c = await seedCommunity();
  const t = makeTestBot();
  await t.bot.handleUpdate(groupCommand(501, '/payments', -100500));
  expect(texts(t)).toContain('личном чате');
  expect(JSON.stringify(t.calls)).toContain(`https://t.me/fc_altynka_bot?start=c${c.id}_payments`);
  const before = t.calls.length;
  const update = groupCommand(501, 'привет');
  if (update.message) update.message.entities = [];
  await t.bot.handleUpdate(update);
  expect(t.calls).toHaveLength(before);
});

test('unknown private commands show help and a menu link', async () => {
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/unknown'));
  expect(texts(t)).toContain('/matches');
  expect(JSON.stringify(t.calls)).toContain('startapp=matches');
});

test('a command menu update failure still allows welcome without leaking the transport URL', async () => {
  const c = await seedCommunity();
  await seedUser('Игрок', { tgId: 501, communityId: c.id });
  tg.members.add(501);
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const t = makeTestBot();
    t.bot.api.config.use(async (prev, method, payload, signal) => {
      if (method === 'setMyCommands') throw new Error('https://api.telegram.org/botsecret-token/setMyCommands');
      return prev(method, payload, signal);
    });
    await t.bot.handleUpdate(privateCommand(501, '/start'));
    expect(texts(t)).toContain('Матчи, составы');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('secret-token');
  } finally { warning.mockRestore(); }
});

test('menu failures do not bypass live membership checks for personal data', async () => {
  const c = await seedCommunity();
  const u = await seedUser('Игрок', { tgId: 501, communityId: c.id });
  await db().insert(events).values({ communityId: c.id, date: '2026-11-07', place: 'Секретное поле', createdBy: u.id, createdAt: 0 });
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const t = makeTestBot();
    t.bot.api.config.use(async (prev, method, payload, signal) => {
      if (method === 'setMyCommands') throw new Error('secret transport URL');
      return prev(method, payload, signal);
    });
    await t.bot.handleUpdate(privateCommand(501, '/matches'));
    expect(texts(t)).toContain('участникам группы');
    expect(texts(t)).not.toContain('Секретное поле');
  } finally { warning.mockRestore(); }
});

test('/matches excludes billed matches from the upcoming list', async () => {
  const c = await seedCommunity();
  const u = await seedUser('Игрок', { tgId: 501, communityId: c.id });
  await db().insert(events).values([
    { communityId: c.id, date: '2026-11-07', place: 'Архивное поле', status: 'billing', createdBy: u.id, createdAt: 0 },
    { communityId: c.id, date: '2026-11-08', place: 'Следующее поле', status: 'collecting', createdBy: u.id, createdAt: 0 },
  ]);
  tg.members.add(501);
  const t = makeTestBot();
  await t.bot.handleUpdate(privateCommand(501, '/matches'));
  expect(texts(t)).toContain('Следующее поле');
  expect(texts(t)).not.toContain('Архивное поле');
});
