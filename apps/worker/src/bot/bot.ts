import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { Db } from '../db/client';
import type { UserRow } from '../db/schema';
import { markPaid } from '../domain/bills';
import { joinEvent, leaveEvent, type Deps } from '../domain/events';
import { bindCommunity, ensureMembership, getCommunity, upsertTgUser } from '../domain/members';
import type { Env } from '../env';
import type { SyncPort } from '../sync/port';
import { miniAppLink } from '../telegram/links';

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
      return r.restored ? `Вернул тебя на твоё место №${r.position}` : `Записал ✅ Ты №${r.position} в основе`;
    case 'reserve':
      return r.restored ? `Вернул тебя на твоё место в резерве, №${r.position}` : `Мест нет, ты в резерве №${r.position}`;
    case 'already':
      return r.inMain ? `Ты уже в списке, №${r.position}` : `Ты уже в резерве, №${r.position}`;
    case 'closed':
      return 'Запись закрыта';
    case 'not_found':
      return 'Сбор не найден';
  }
});

registerCallback('l', async ({ deps, user, arg }) => {
  const r = await leaveEvent(deps, Number(arg), user.id);
  switch (r.kind) {
    case 'left':
      return 'Выписал. Передумал? Жми «Иду» в течение 2 минут — место сохранится';
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
  return { ok: 'Отметил ✅ Спасибо!', already: 'Уже отмечено', not_in_bill: 'Тебя нет в этом счёте', closed: 'Счёт закрыт' }[r];
});

export function createBot(env: Env, deps: BotDeps, botInfo?: UserFromGetMe): Bot {
  const bot = new Bot(env.BOT_TOKEN, { botInfo });

  bot.chatType(['group', 'supergroup']).command('bind', async ctx => {
    if (String(ctx.from.id) !== env.ADMIN_TG_ID) return;
    const c = await bindCommunity(deps.db, ctx.chat.id, ctx.chat.title);
    const admin = await upsertTgUser(deps.db, ctx.from, deps.now());
    await ensureMembership(deps.db, c.id, admin.id);
    await ctx.reply('Группа привязана ✅');
  });

  bot.chatType('private').command('start', async ctx => {
    await ctx.reply('Сборы, составы и счёт — в мини-аппе 👇', {
      reply_markup: { inline_keyboard: [[{ text: '📱 Открыть', url: miniAppLink(env) }]] },
    });
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
    const user = await upsertTgUser(deps.db, ctx.from, deps.now());
    await ensureMembership(deps.db, community.id, user.id);
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
