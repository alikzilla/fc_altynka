import { Bot } from 'grammy';
import { and, eq } from 'drizzle-orm';
import type { UserFromGetMe } from 'grammy/types';
import type { Db } from '../db/client';
import { billLines, communities, memberships, users, type UserRow } from '../db/schema';
import { billDto, getBill, markPaid } from '../domain/bills';
import { getEvent, joinEvent, leaveEvent, type Deps } from '../domain/events';
import { bindCommunity, communityByChat, confirmedMembership, ensureMembership, moveCommunityChat, upsertTgUser } from '../domain/members';
import type { Env } from '../env';
import type { SyncPort } from '../sync/port';
import { makeTgClient } from '../telegram/client';
import { registerPrivateCommands } from './private';
import { miniAppLink } from '../telegram/links';
import { restoreCommunitySync } from '../domain/reactivate';

export interface BotDeps {
  db: Db;
  sync: SyncPort;
  now: () => number;
}

export interface CallbackCtx {
  env: Env;
  deps: Deps;
  user: UserRow;
  arg: string;
}

type CallbackHandler = (c: CallbackCtx) => Promise<string>;

const callbacks = new Map<string, CallbackHandler>();

/** Обработчик inline-кнопки с данными `<prefix>:<arg>`; возвращает текст всплывашки. */
export function registerCallback(prefix: string, handler: CallbackHandler): void {
  callbacks.set(prefix, handler);
}

registerCallback('j', async ({ deps, user, arg }) => {
  const r = await joinEvent(deps, Number(arg), user.id);
  switch (r.kind) {
    case 'main':
      return `${r.restored ? 'Ты снова в основе' : 'Ты в основе'} · место ${r.position}`;
    case 'reserve':
      return `${r.restored ? 'Ты снова в резерве' : 'Ты в резерве'} · место ${r.position}`;
    case 'already':
      return `Ты уже ${r.inMain ? 'в основе' : 'в резерве'} · место ${r.position}`;
    case 'closed':
      return 'Запись на этот матч закрыта';
    case 'not_found':
      return 'Матч не найден';
  }
});

registerCallback('l', async ({ deps, user, arg }) => {
  const r = await leaveEvent(deps, Number(arg), user.id);
  switch (r.kind) {
    case 'left':
      return 'Запись отменена. В течение 2 минут можно вернуть прежнее место.';
    case 'not_in':
      return 'Тебя нет в списке';
    case 'closed':
      return 'Запись закрыта';
    case 'not_found':
      return 'Сбор не найден';
  }
});

registerCallback('p', async ({ deps, user, arg }) => {
  const r = await markPaid(deps, Number(arg), user.id, user.id);
  return { ok: 'Ты отметил оплату', already: 'Оплата уже отмечена', not_in_bill: 'Этот счёт тебе недоступен', closed: 'Счёт закрыт', stale: 'Счёт изменился. Открой актуальную оплату.' }[r];
});

export function createBot(env: Env, deps: BotDeps, botInfo?: UserFromGetMe): Bot {
  const bot = new Bot(env.BOT_TOKEN, { botInfo });
  registerPrivateCommands(bot, env, deps);

  bot.chatType(['group', 'supergroup']).command('bind', async ctx => {
    if (!ctx.from || ctx.from.is_bot || ctx.message.sender_chat) return void await ctx.reply('Отправь /bind от своего личного аккаунта администратора.');
    const sender = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    if (sender.status !== 'creator' && sender.status !== 'administrator') return void await ctx.reply('Подключить бота может администратор этой группы.');
    const own = await ctx.api.getChatMember(ctx.chat.id, ctx.me.id);
    if (own.status !== 'administrator' || !own.can_pin_messages) return void await ctx.reply('Назначь бота администратором с правом закреплять сообщения, затем повтори /bind.');
    const c = await bindCommunity(deps.db, ctx.chat.id, ctx.chat.title);
    const admin = await upsertTgUser(deps.db, ctx.from, deps.now());
    await ensureMembership(deps.db, c.id, admin.id, deps.now());
    await deps.db.update(memberships).set({ telegramAdmin: true }).where(and(eq(memberships.communityId, c.id), eq(memberships.userId, admin.id)));
    await restoreCommunitySync(deps.db, deps.sync, c.id, deps.now());
    await ctx.reply(`Группа привязана ✅\n${c.title}`, { reply_markup: { inline_keyboard: [[{ text: 'Открыть команду', url: miniAppLink(env, `c${c.id}_matches`) }]] } });
  });

  bot.on('my_chat_member', async ctx => {
    const community = await communityByChat(deps.db, ctx.chat.id);
    if (!community) return;
    const member = ctx.myChatMember.new_chat_member;
    const active = member.status === 'administrator' && member.can_pin_messages;
    await deps.db.update(communities).set({ active }).where(eq(communities.id, community.id));
    if (active && !community.active) await restoreCommunitySync(deps.db, deps.sync, community.id, deps.now());
  });

  bot.on('chat_member', async ctx => {
    const community = await communityByChat(deps.db, ctx.chat.id);
    if (!community) return;
    const member = ctx.chatMember.new_chat_member;
    const [user] = await deps.db.select().from(users).where(eq(users.tgId, member.user.id));
    if (!user) return;
    const admin = member.status === 'administrator' || member.status === 'creator';
    const active = admin || member.status === 'member' || member.status === 'restricted' && member.is_member;
    await deps.db.update(memberships).set({ active, telegramAdmin: admin, checkedAt: 0, ...(!active ? { legacy: false } : {}) })
      .where(and(eq(memberships.communityId, community.id), eq(memberships.userId, user.id)));
  });

  bot.on('message:migrate_to_chat_id', async ctx => {
    await moveCommunityChat(deps.db, ctx.chat.id, ctx.message.migrate_to_chat_id);
  });

  bot.callbackQuery(/^pp:(\d+):(\d+):(\d+):(\d{11})$/, async ctx => {
    const [, billId, due, receiverTgId, phoneDigits] = ctx.match;
    const chat = ctx.callbackQuery.message?.chat;
    const bill = await getBill(deps.db, Number(billId));
    // Debts follow the bill line, not membership: whoever owns a line may settle it even after leaving the group.
    const [known] = await deps.db.select({ id: users.id }).from(users).where(eq(users.tgId, ctx.from.id));
    const owned = known && bill ? (await deps.db.select({ id: billLines.id }).from(billLines)
      .where(and(eq(billLines.billId, bill.id), eq(billLines.userId, known.id))))[0] : undefined;
    if (chat?.type !== 'private' || chat.id !== ctx.from.id || !bill || !owned) {
      return void await ctx.answerCallbackQuery({ text: 'Этот счёт тебе недоступен' });
    }
    if (bill.status === 'closed') return void await ctx.answerCallbackQuery({ text: 'Счёт закрыт' });
    const user = await upsertTgUser(deps.db, ctx.from, deps.now());
    const dto = await billDto(deps.db, bill.id);
    const line = dto.lines.find(l => l.userId === user.id);
    if (!line) return void await ctx.answerCallbackQuery({ text: 'Этот счёт тебе недоступен' });
    const [receiver] = await deps.db.select().from(users).where(eq(users.id, bill.receiverUserId));
    if (line.due !== Number(due) || receiver?.tgId !== Number(receiverTgId) || receiver.kaspiPhone?.replace(/\D/g, '') !== phoneDigits) {
      return void await ctx.answerCallbackQuery({ text: 'Счёт изменился. Открой актуальную оплату.' });
    }
    const result = await markPaid({ db: deps.db, now: deps.now(), sync: deps.sync }, bill.id, user.id, user.id,
      { due: Number(due), receiverUserId: bill.receiverUserId, receiverPhone: receiver.kaspiPhone! });
    await ctx.answerCallbackQuery({ text: { ok: 'Ты отметил оплату', already: 'Оплата уже отмечена', closed: 'Счёт закрыт', not_in_bill: 'Этот счёт тебе недоступен', stale: 'Счёт изменился. Открой актуальную оплату.' }[result] });
  });

  bot.on('callback_query:data', async ctx => {
    const data = ctx.callbackQuery.data;
    const i = data.indexOf(':');
    const handler = i > 0 ? callbacks.get(data.slice(0, i)) : undefined;
    if (!handler) {
      await ctx.answerCallbackQuery();
      return;
    }
    const community = await communityByChat(deps.db, ctx.callbackQuery.message?.chat.id ?? 0);
    const arg = data.slice(i + 1);
    const objectId = /^[1-9]\d*$/.test(arg) && Number.isSafeInteger(Number(arg)) ? Number(arg) : 0;
    const bill = data.slice(0, i) === 'p' ? await getBill(deps.db, objectId) : null;
    const event = await getEvent(deps.db, bill?.eventId ?? objectId);
    if (!community?.active || !event || event.communityId !== community.id || data.slice(0, i) === 'p' && !bill) {
      await ctx.answerCallbackQuery({ text: 'Этот сбор ведётся в другой группе' });
      return;
    }
    const user = await upsertTgUser(deps.db, ctx.from, deps.now());
    if (!(await confirmedMembership(deps.db, makeTgClient(env), community, user, deps.now(), env.ADMIN_TG_ID))) {
      return void await ctx.answerCallbackQuery({ text: 'Доступно только участникам этой группы' });
    }
    const text = await handler({
      env,
      deps: { db: deps.db, now: deps.now(), sync: deps.sync },
      user,
      arg: data.slice(i + 1),
    });
    await ctx.answerCallbackQuery({ text });
  });

  return bot;
}
