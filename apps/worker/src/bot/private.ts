import { escapeHtml, formatDateRu, lineStatus } from '@altynka/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Bot, Context } from 'grammy';
import { billLines, bills, communities, events, users } from '../db/schema';
import { communityByChat, confirmedMemberships, confirmedMembership, getCommunity, upsertTgUser } from '../domain/members';
import type { Env } from '../env';
import { makeTgClient } from '../telegram/client';
import { miniAppLink } from '../telegram/links';
import type { BotDeps } from './bot';
import { appKeyboard, helpText, organizerCommands, playerCommands, settingsKeyboard, settingsText } from './presentation';
import { activeEventFilter } from '../domain/eventPhase';

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

  const connectHint = (text: string) => ({ text, opts: { reply_markup: { inline_keyboard: [[{ text: 'Добавить в группу', url: `https://t.me/${env.BOT_USERNAME}?startgroup=connect&admin=pin_messages` }]] } } });

  /** The person and every group Telegram currently confirms; `joinId` (from a c{id}_ deep link) is a reason to check that group too. */
  const identify = async (ctx: Context, joinId?: number) => {
    if (!ctx.from) return null;
    const user = await upsertTgUser(deps.db, ctx.from, deps.now());
    const tg = makeTgClient(env);
    if (joinId !== undefined) {
      const target = await getCommunity(deps.db, joinId);
      if (target) await confirmedMembership(deps.db, tg, target, user, deps.now(), env.ADMIN_TG_ID);
    }
    const groups = await confirmedMemberships(deps.db, tg, env, user, deps.now());
    if (groups.length) {
      const commands = groups.some(g => g.role !== 'player') ? organizerCommands : playerCommands;
      try { await ctx.api.setMyCommands(commands, { scope: { type: 'chat', chat_id: ctx.from.id } }); }
      catch { console.warn('Telegram private command menu could not be updated.'); }
    }
    return { user, groups };
  };

  const perform = async (ctx: Context, action: Action, joinId?: number) => {
    const me = await identify(ctx, joinId);
    if (!me) return;
    const { user, groups } = me;
    const noGroups = async () => {
      const h = connectHint('Матчи и оплаты доступны участникам группы команды. Открой приложение по кнопке в её группе. Чтобы подключить свою группу, добавь бота администратором и отправь в ней /bind.');
      await ctx.reply(h.text, h.opts);
    };
    if (action === 'settings') {
      await ctx.reply(settingsText(user.notificationsEnabled, user.pmAvailable), { parse_mode: 'HTML', reply_markup: settingsKeyboard(env, user.notificationsEnabled) });
    } else if (!groups.length && action !== 'payments') {
      await noGroups();
    } else if (action === 'newmatch') {
      if (groups.some(g => g.role !== 'player')) {
        await ctx.reply('Создай матч в приложении.', { reply_markup: appKeyboard(env, 'Создать матч', 'newmatch') });
      } else {
        const h = connectHint('Создать матч может организатор группы. Чтобы создавать матчи, добавь бота в свою группу администратором и отправь в ней /bind или попроси организатора назначить тебя.');
        await ctx.reply(h.text, h.opts);
      }
    } else if (action === 'matches') {
      const rows = await deps.db.select({ id: events.id, date: events.date, startTime: events.startTime, place: events.place, group: communities.title }).from(events)
        .innerJoin(communities, eq(communities.id, events.communityId))
        .where(and(inArray(events.communityId, groups.map(g => g.community.id)), activeEventFilter(false)))
        .orderBy(asc(events.date), asc(events.id)).limit(8);
      const label = groups.length > 1;
      const text = rows.length ? '<b>Предстоящие матчи</b>\n\n' + rows.map(e => `${formatDateRu(e.date)} · ${e.startTime ?? 'время не назначено'}${e.place ? ` · ${escapeHtml(e.place)}` : ''}${label ? ` · ${escapeHtml(e.group)}` : ''}`).join('\n') : 'Пока нет активных матчей.';
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
        ...rows.map(e => [{ text: `Открыть матч · ${formatDateRu(e.date)}`, url: miniAppLink(env, `e${e.id}`) }]),
        [{ text: 'Все матчи', url: miniAppLink(env, 'matches') }],
      ] } });
    } else if (action === 'payments') {
      // Debts belong to the person, not to a membership: groups they left still show.
      const rows = await deps.db.select({ eventId: events.id, date: events.date, amount: billLines.amount, paidAmount: billLines.paidAmount, units: billLines.units, communityId: events.communityId, group: communities.title })
        .from(billLines).innerJoin(bills, eq(bills.id, billLines.billId)).innerJoin(events, eq(events.id, bills.eventId)).innerJoin(communities, eq(communities.id, events.communityId))
        .where(and(eq(billLines.userId, user.id), eq(bills.status, 'open'), sql`${billLines.amount} > coalesce(${billLines.paidAmount}, 0)`))
        .orderBy(asc(events.date), asc(events.id)).limit(8);
      if (!rows.length && !groups.length) return void await noGroups();
      // Group titles appear when the person has several groups or the debts span several groups.
      const label = groups.length > 1 || new Set(rows.map(r => r.communityId)).size > 1;
      const mine = new Set(groups.map(g => g.community.id));
      const text = rows.length ? '<b>Мои платежи</b>\n\n' + rows.map(r => `${formatDateRu(r.date)} · осталось ${money(lineStatus(r.amount, r.paidAmount).due)}${r.units > 1 ? ` · за тебя и гостей: ${r.units - 1}` : ''}${label ? ` · ${escapeHtml(r.group)}` : ''}`).join('\n') : 'Нет открытых платежей.';
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
        // A left group's match page is not reachable: such a debt is paid from the tasks screen.
        ...rows.map(r => [{ text: `Открыть оплату · ${formatDateRu(r.date)}`, url: miniAppLink(env, mine.has(r.communityId) ? `b${r.eventId}` : 'payments') }]),
        [{ text: 'Все платежи', url: miniAppLink(env, 'payments') }],
      ] } });
    } else {
      await ctx.reply(action === 'help' ? helpText : 'Матчи, составы и оплата поля.\n\nОткрой матчи, чтобы записаться на игру. Личные уведомления можно настроить отдельно.', {
        parse_mode: 'HTML', reply_markup: appKeyboard(env, 'Открыть приложение', 'matches'),
      });
    }
  };

  privateChat.command('start', async ctx => {
    const linked = /^c([1-9]\d*)_(\w+)$/.exec(ctx.match);
    await perform(ctx, actionOf(linked?.[2] ?? ctx.match), linked ? Number(linked[1]) : undefined);
  });
  for (const action of actions.filter(a => a !== 'start')) privateChat.command(action, ctx => perform(ctx, action));
  // Legacy buttons carried a group id (notify:<id>:0|1); the setting is personal, so the id is ignored.
  privateChat.callbackQuery(/^notify:(?:[1-9]\d*:)?([01])$/, async ctx => {
    if (!ctx.from) return;
    const user = await upsertTgUser(deps.db, ctx.from, deps.now());
    const enabled = ctx.match[1] === '1';
    await deps.db.update(users).set({ notificationsEnabled: enabled }).where(eq(users.id, user.id));
    await ctx.answerCallbackQuery({ text: enabled ? 'Уведомления включены' : 'Уведомления выключены' });
    await ctx.editMessageText(settingsText(enabled, true), { parse_mode: 'HTML', reply_markup: settingsKeyboard(env, enabled) });
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
