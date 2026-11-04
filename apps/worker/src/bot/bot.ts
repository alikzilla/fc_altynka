import { formatDateRu } from '@altynka/core';
import { Bot } from 'grammy';
import { eq } from 'drizzle-orm';
import type { UserFromGetMe } from 'grammy/types';
import type { Db } from '../db/client';
import { users, type UserRow } from '../db/schema';
import { billDto, getBill, markPaid } from '../domain/bills';
import { getEvent, joinEvent, leaveEvent, type Deps } from '../domain/events';
import { bindCommunity, ensureMembership, getCommunity, moveCommunityChat, openEvents, upsertTgUser } from '../domain/members';
import type { Env } from '../env';
import type { SyncPort } from '../sync/port';
import { makeTgClient } from '../telegram/client';
import { registerPrivateCommands } from './private';

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
    if (String(ctx.from.id) !== env.ADMIN_TG_ID) return;
    const current = await getCommunity(deps.db);
    const open = current && current.tgChatId !== ctx.chat.id ? await openEvents(deps.db, current.id) : [];
    if (open.length) {
      await ctx.reply(
        `Сначала заверши открытые сборы в прежней группе — отмени их или закрой счёт в мини-аппе: ${open.map(e => formatDateRu(e.date)).join('; ')}`,
      );
      return;
    }
    const c = await bindCommunity(deps.db, ctx.chat.id, ctx.chat.title);
    const admin = await upsertTgUser(deps.db, ctx.from, deps.now());
    await ensureMembership(deps.db, c.id, admin.id);
    await ctx.reply('Группа привязана ✅');
  });

  bot.on('message:migrate_to_chat_id', async ctx => {
    await moveCommunityChat(deps.db, ctx.chat.id, ctx.message.migrate_to_chat_id);
  });

  bot.callbackQuery(/^pp:(\d+):(\d+):(\d+):(\d{11})$/, async ctx => {
    const [, billId, due, receiverTgId, phoneDigits] = ctx.match;
    const community = await getCommunity(deps.db);
    const chat = ctx.callbackQuery.message?.chat;
    const bill = await getBill(deps.db, Number(billId));
    const event = bill ? await getEvent(deps.db, bill.eventId) : null;
    if (chat?.type !== 'private' || chat.id !== ctx.from.id || !community || !bill || event?.communityId !== community.id
      || !(await makeTgClient(env).isMember(community.tgChatId, ctx.from.id))) {
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
    const community = handler ? await getCommunity(deps.db) : null;
    if (!handler || !community) {
      await ctx.answerCallbackQuery();
      return;
    }
    if (ctx.callbackQuery.message?.chat.id !== community.tgChatId) {
      await ctx.answerCallbackQuery({ text: 'Этот сбор ведётся в другой группе' });
      return;
    }
    const user = await upsertTgUser(deps.db, ctx.from, deps.now());
    await ensureMembership(deps.db, community.id, user.id, deps.now());
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
