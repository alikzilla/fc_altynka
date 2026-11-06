import { escapeHtml, formatDateRu, lineStatus } from '@altynka/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Bot, Context } from 'grammy';
import { billLines, bills, events, memberships, users } from '../db/schema';
import { communityByChat, confirmedCommunities, confirmedMembership, effectiveRole, getCommunity, memberUser, upsertTgUser } from '../domain/members';
import type { Env } from '../env';
import { makeTgClient } from '../telegram/client';
import { miniAppLink } from '../telegram/links';
import type { BotDeps } from './bot';
import { appKeyboard, helpText, organizerCommands, playerCommands, settingsKeyboard, settingsText } from './presentation';

const money = (amount: number) => `${amount.toLocaleString('ru-RU').replace(/\s/g, ' ')} ₸`;
const actions = ['start', 'matches', 'payments', 'settings', 'newmatch', 'help'] as const;
type Action = typeof actions[number];
const actionOf = (value: string): Action => actions.includes(value as Action) ? value as Action : 'start';

export function registerPrivateCommands(bot: Bot, env: Env, deps: BotDeps): void {
  const privateChat = bot.chatType('private');
  privateChat.use(async (ctx, next) => {
    if (ctx.from && (ctx.message || ctx.callbackQuery)) {
      const user = await upsertTgUser(deps.db, ctx.from, deps.now());
      await deps.db.update(users).set({ pmAvailable: true }).where(eq(users.id, user.id));
    }
    await next();
  });

  const select = async (ctx: Context, action: Action, communityId?: number) => {
    if (!ctx.from) return null;
    const user = await upsertTgUser(deps.db, ctx.from, deps.now());
    const tg = makeTgClient(env);
    const available = communityId === undefined ? await confirmedCommunities(deps.db, tg, user) : [];
    if (communityId === undefined && available.length !== 1) {
      if (available.length) await ctx.reply('Выбери команду:', { reply_markup: { inline_keyboard:
        available.map(c => [{ text: c.title, callback_data: `team:${c.id}:${action}` }]),
      } });
      else await ctx.reply('Матчи и оплаты доступны участникам группы команды. Открой приложение по кнопке в её группе. Чтобы подключить свою группу, добавь бота администратором и отправь в ней /bind.', {
        reply_markup: { inline_keyboard: [[{ text: 'Добавить в группу', url: `https://t.me/${env.BOT_USERNAME}?startgroup=connect&admin=pin_messages` }]] },
      });
      return null;
    }
    const community = communityId === undefined ? available[0] : await getCommunity(deps.db, communityId);
    const membership = community && await confirmedMembership(deps.db, tg, community, user, deps.now(), env.ADMIN_TG_ID);
    if (!community || !membership) { await ctx.reply('Команда доступна только участникам её группы.'); return null; }
    const role = effectiveRole(env, user, membership);
    try { await ctx.api.setMyCommands(role === 'player' ? playerCommands : organizerCommands, { scope: { type: 'chat', chat_id: ctx.from.id } }); }
    catch { console.warn('Telegram private command menu could not be updated.'); }
    return { community, user: memberUser(user, membership), role };
  };

  const perform = async (ctx: Context, action: Action, communityId?: number) => {
    const m = await select(ctx, action, communityId);
    if (!m) return;
    const section = (value: string) => `c${m.community.id}_${value}`;
    const title = `<b>${escapeHtml(m.community.title)}</b>\n\n`;
    if (action === 'settings') {
      await ctx.reply(title + settingsText(m.user.notificationsEnabled, m.user.pmAvailable), { parse_mode: 'HTML', reply_markup: settingsKeyboard(env, m.user.notificationsEnabled, m.community.id) });
    } else if (action === 'newmatch') {
      await ctx.reply(m.role === 'player' ? 'Создать матч может организатор этой команды.' : 'Создай матч в приложении.', {
        reply_markup: appKeyboard(env, 'Открыть команду', section(m.role === 'player' ? 'matches' : 'newmatch')),
      });
    } else if (action === 'matches') {
      const rows = await deps.db.select().from(events).where(and(eq(events.communityId, m.community.id), inArray(events.status, ['collecting', 'scheduled'])))
        .orderBy(asc(events.date), asc(events.id)).limit(8);
      const text = rows.length ? '<b>Предстоящие матчи</b>\n\n' + rows.map(e => `${formatDateRu(e.date)} · ${e.startTime ?? 'время не назначено'}${e.place ? ` · ${escapeHtml(e.place)}` : ''}`).join('\n') : 'Пока нет активных матчей.';
      await ctx.reply(title + text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
        ...rows.map(e => [{ text: `Открыть матч · ${formatDateRu(e.date)}`, url: miniAppLink(env, `e${e.id}`) }]),
        [{ text: 'Все матчи', url: miniAppLink(env, section('matches')) }],
      ] } });
    } else if (action === 'payments') {
      const rows = await deps.db.select({ eventId: events.id, date: events.date, amount: billLines.amount, paidAmount: billLines.paidAmount, units: billLines.units })
        .from(billLines).innerJoin(bills, eq(bills.id, billLines.billId)).innerJoin(events, eq(events.id, bills.eventId))
        .where(and(eq(events.communityId, m.community.id), eq(billLines.userId, m.user.id), eq(bills.status, 'open'), sql`${billLines.amount} > coalesce(${billLines.paidAmount}, 0)`))
        .orderBy(asc(events.date), asc(events.id)).limit(8);
      const text = rows.length ? '<b>Мои платежи</b>\n\n' + rows.map(r => `${formatDateRu(r.date)} · осталось ${money(lineStatus(r.amount, r.paidAmount).due)}${r.units > 1 ? ` · за тебя и гостей: ${r.units - 1}` : ''}`).join('\n') : 'Нет открытых платежей.';
      await ctx.reply(title + text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
        ...rows.map(r => [{ text: `Открыть оплату · ${formatDateRu(r.date)}`, url: miniAppLink(env, `b${r.eventId}`) }]),
        [{ text: 'Все платежи', url: miniAppLink(env, section('payments')) }],
      ] } });
    } else {
      await ctx.reply(title + (action === 'help' ? helpText : 'Матчи, составы и оплата поля.\n\nОткрой матчи, чтобы записаться на игру. Личные уведомления можно настроить отдельно.'), {
        parse_mode: 'HTML', reply_markup: appKeyboard(env, 'Открыть приложение', section('matches')),
      });
    }
  };

  privateChat.command('start', async ctx => {
    const linked = /^c([1-9]\d*)_(\w+)$/.exec(ctx.match);
    await perform(ctx, actionOf(linked?.[2] ?? ctx.match), linked ? Number(linked[1]) : undefined);
  });
  for (const action of actions.filter(a => a !== 'start')) privateChat.command(action, ctx => perform(ctx, action));
  privateChat.callbackQuery(/^team:([1-9]\d*):(start|matches|payments|settings|newmatch|help)$/, async ctx => {
    await ctx.answerCallbackQuery();
    await perform(ctx, actionOf(ctx.match[2]), Number(ctx.match[1]));
  });
  privateChat.callbackQuery(/^notify:(?:([1-9]\d*):)?([01])$/, async ctx => {
    const m = await select(ctx, 'settings', ctx.match[1] ? Number(ctx.match[1]) : undefined);
    if (!m) { await ctx.answerCallbackQuery({ text: 'Выбери команду для настройки' }); return; }
    const enabled = ctx.match[2] === '1';
    await deps.db.update(memberships).set({ notificationsEnabled: enabled })
      .where(and(eq(memberships.communityId, m.community.id), eq(memberships.userId, m.user.id)));
    await ctx.answerCallbackQuery({ text: enabled ? 'Уведомления включены' : 'Уведомления выключены' });
    await ctx.editMessageText(`<b>${escapeHtml(m.community.title)}</b>\n\n${settingsText(enabled, true)}`, {
      parse_mode: 'HTML', reply_markup: settingsKeyboard(env, enabled, m.community.id),
    });
  });
  privateChat.on('message:entities:bot_command', ctx => ctx.reply(`Такой команды нет.\n\n${helpText}`, { reply_markup: appKeyboard(env, 'Открыть команды', 'matches') }));

  const group = bot.chatType(['group', 'supergroup']);
  group.command(['start', 'payments', 'settings', 'newmatch'], async ctx => {
    const action = actionOf(ctx.message.text.slice(1).split(/[\s@]/)[0]);
    const c = await communityByChat(deps.db, ctx.chat.id);
    if (!c?.active) return void await ctx.reply('Администратор группы может подключить команду: /bind');
    await ctx.reply('Открой бота в личном чате.', { reply_markup: { inline_keyboard: [[{
      text: 'Открыть личный чат', url: `https://t.me/${env.BOT_USERNAME}?start=c${c.id}_${action}`,
    }]] } });
  });
  group.command(['matches', 'help'], async ctx => {
    const c = await communityByChat(deps.db, ctx.chat.id);
    if (!c?.active) return void await ctx.reply('Администратор группы может подключить команду: /bind');
    await ctx.reply('Запись и список матчей — в приложении команды.', { reply_markup: appKeyboard(env, 'Открыть матчи', `c${c.id}_matches`) });
  });
}
