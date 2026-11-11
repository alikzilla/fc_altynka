import { escapeHtml, formatDateRu, lineStatus, plural } from '@altynka/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { GrammyError, type Bot, type Context } from 'grammy';
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'grammy/types';
import { billLines, bills, communities, events, users, type UserRow } from '../db/schema';
import { getEvent, joinEvent, leaveEvent } from '../domain/events';
import { communityByChat, confirmedMemberships, confirmedMembership, getCommunity, upsertTgUser, type MyMembership } from '../domain/members';
import type { Env } from '../env';
import { matchCard, matchSummary, placeIn, signupButton, signupOpen } from '../render/personal';
import { loadEventView } from '../sync/parts';
import { makeTgClient } from '../telegram/client';
import { miniAppLink } from '../telegram/links';
import type { BotDeps } from './bot';
import { appKeyboard, helpText, joinAnswer, leaveAnswer, menuRow, NEWS_URL, organizerCommands, playerCommands, settingsKeyboard, settingsText } from './presentation';
import { activeEventFilter } from '../domain/eventPhase';

const money = (amount: number) => `${amount.toLocaleString('ru-RU').replace(/\s/g, ' ')} ₸`;
const actions = ['start', 'matches', 'payments', 'settings', 'newmatch', 'help'] as const;
type Action = typeof actions[number];
const actionOf = (value: string): Action => actions.includes(value as Action) ? value as Action : 'start';
/** Экран личного чата: команда присылает его новым сообщением, кнопка меню перерисовывает текущее. */
interface Screen { text: string; keyboard: InlineKeyboardMarkup }
const NO_GROUPS = 'Матчи и оплаты доступны участникам группы команды. Открой приложение по кнопке в её группе. Чтобы подключить свою группу, добавь бота администратором и отправь в ней /bind.';

export function registerPrivateCommands(bot: Bot, env: Env, deps: BotDeps): void {
  const privateChat = bot.chatType('private');
  privateChat.use(async (ctx, next) => {
    if (ctx.from && (ctx.message || ctx.callbackQuery)) {
      const user = await upsertTgUser(deps.db, ctx.from, deps.now());
      await deps.db.update(users).set({ pmAvailable: true }).where(eq(users.id, user.id));
    }
    await next();
  });

  const connectHint = (text: string): Screen => ({ text, keyboard: { inline_keyboard: [[{ text: 'Добавить в группу', url: `https://t.me/${env.BOT_USERNAME}?startgroup=connect&admin=pin_messages` }]] } });

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

  const upcoming = (groups: MyMembership[], limit: number) => deps.db
    .select({ id: events.id, date: events.date, startTime: events.startTime, place: events.place, group: communities.title }).from(events)
    .innerJoin(communities, eq(communities.id, events.communityId))
    .where(and(inArray(events.communityId, groups.map(g => g.community.id)), activeEventFilter(false)))
    .orderBy(asc(events.date), asc(events.id)).limit(limit);

  // Debts belong to the person, not to a membership: groups they left still show.
  const debts = (user: UserRow) => deps.db
    .select({ eventId: events.id, date: events.date, amount: billLines.amount, paidAmount: billLines.paidAmount, units: billLines.units, communityId: events.communityId, group: communities.title })
    .from(billLines).innerJoin(bills, eq(bills.id, billLines.billId)).innerJoin(events, eq(events.id, bills.eventId)).innerJoin(communities, eq(communities.id, events.communityId))
    .where(and(eq(billLines.userId, user.id), eq(bills.status, 'open'), sql`${billLines.amount} > coalesce(${billLines.paidAmount}, 0)`))
    .orderBy(asc(events.date), asc(events.id));

  /** Главное меню: ближайший матч с записью в одно нажатие, долг и состояние уведомлений. */
  const homeScreen = async (user: UserRow, groups: MyMembership[]): Promise<Screen> => {
    if (!groups.length) return connectHint(NO_GROUPS);
    const lines = ['<b>ФК Алтынка</b>', `Привет, ${escapeHtml(user.firstName)}!`, ''];
    const rows: InlineKeyboardButton[][] = [];
    const [next] = await upcoming(groups, 1);
    const view = next ? await loadEventView(deps.db, next.id) : null;
    if (view) {
      const place = placeIn(view, user.tgId);
      lines.push(`<b>Ближайший матч · ${formatDateRu(view.date)}</b>${groups.length > 1 ? ` · ${escapeHtml(next.group)}` : ''}`, ...matchSummary(view, place));
      const open = { text: 'Открыть матч', url: miniAppLink(env, `e${view.id}`) };
      rows.push(signupOpen(view) ? [signupButton(view, place, 'h'), open] : [open]);
    } else lines.push('Активных матчей пока нет. Когда организатор откроет запись, матч появится здесь.');
    const owed = await debts(user);
    if (owed.length) {
      const total = owed.reduce((sum, r) => sum + lineStatus(r.amount, r.paidAmount).due, 0);
      lines.push('', `К оплате: <b>${money(total)}</b> · ${owed.length} ${plural(owed.length, 'счёт', 'счёта', 'счетов')}`);
    }
    if (!user.notificationsEnabled) lines.push('', 'Уведомления выключены: бот не напишет о новом матче, месте в основе и оплате.');
    rows.push(
      [{ text: 'Матчи', callback_data: 'm:matches' }, { text: owed.length ? `Платежи · ${owed.length}` : 'Платежи', callback_data: 'm:payments' }],
      [user.notificationsEnabled ? { text: 'Уведомления', callback_data: 'm:settings' } : { text: 'Включить уведомления', callback_data: 'notify:1' }, { text: 'Помощь', callback_data: 'm:help' }],
      ...(groups.some(g => g.role !== 'player') ? [[{ text: 'Создать матч', url: miniAppLink(env, 'newmatch') }]] : []),
      [{ text: 'Открыть приложение', url: miniAppLink(env, 'matches') }, { text: 'Новости', url: NEWS_URL }],
    );
    return { text: lines.join('\n'), keyboard: { inline_keyboard: rows } };
  };

  const matchesScreen = async (user: UserRow, groups: MyMembership[]): Promise<Screen> => {
    if (!groups.length) return connectHint(NO_GROUPS);
    const rows = await upcoming(groups, 8);
    const label = groups.length > 1;
    const blocks: string[] = [];
    const buttons: InlineKeyboardButton[][] = [];
    for (const e of rows) {
      const view = await loadEventView(deps.db, e.id);
      if (!view) continue;
      const place = placeIn(view, user.tgId);
      const date = formatDateRu(e.date);
      blocks.push([`<b>${date}</b> · ${e.startTime ?? 'время не назначено'}${e.place ? ` · ${escapeHtml(e.place)}` : ''}${label ? ` · ${escapeHtml(e.group)}` : ''}`,
        matchSummary(view, place).slice(1).join(' · ')].join('\n'));
      const open = { text: `Открыть матч · ${date}`, url: miniAppLink(env, `e${e.id}`) };
      buttons.push(signupOpen(view) ? [signupButton(view, place, 'm', ` · ${date}`), { ...open, text: 'Открыть' }] : [open]);
    }
    return {
      text: blocks.length ? `<b>Предстоящие матчи</b>\n\n${blocks.join('\n\n')}` : 'Пока нет активных матчей.',
      keyboard: { inline_keyboard: [...buttons, [{ text: 'Все матчи', url: miniAppLink(env, 'matches') }, ...menuRow]] },
    };
  };

  const paymentsScreen = async (user: UserRow, groups: MyMembership[]): Promise<Screen> => {
    const rows = (await debts(user)).slice(0, 8);
    if (!rows.length && !groups.length) return connectHint(NO_GROUPS);
    // Group titles appear when the person has several groups or the debts span several groups.
    const label = groups.length > 1 || new Set(rows.map(r => r.communityId)).size > 1;
    const mine = new Set(groups.map(g => g.community.id));
    const text = rows.length ? '<b>Мои платежи</b>\n\n' + rows.map(r => `${formatDateRu(r.date)} · осталось ${money(lineStatus(r.amount, r.paidAmount).due)}${r.units > 1 ? ` · за тебя и гостей: ${r.units - 1}` : ''}${label ? ` · ${escapeHtml(r.group)}` : ''}`).join('\n') : 'Нет открытых платежей.';
    return { text, keyboard: { inline_keyboard: [
      // A left group's match page is not reachable: such a debt is paid from the tasks screen.
      ...rows.map(r => [{ text: `Открыть оплату · ${formatDateRu(r.date)}`, url: miniAppLink(env, mine.has(r.communityId) ? `b${r.eventId}` : 'payments') }]),
      [{ text: 'Все платежи', url: miniAppLink(env, 'payments') }, ...menuRow],
    ] } };
  };

  const screenOf = async (action: Action, user: UserRow, groups: MyMembership[]): Promise<Screen> => {
    switch (action) {
      case 'settings': return { text: settingsText(user.notificationsEnabled, user.pmAvailable), keyboard: settingsKeyboard(env, user.notificationsEnabled) };
      case 'payments': return paymentsScreen(user, groups);
      case 'matches': return matchesScreen(user, groups);
      case 'help': return groups.length ? { text: helpText, keyboard: { inline_keyboard: [[{ text: 'Открыть приложение', url: miniAppLink(env, 'matches') }, { text: 'Новости', url: NEWS_URL }], menuRow] } } : connectHint(NO_GROUPS);
      case 'newmatch':
        if (!groups.length) return connectHint(NO_GROUPS);
        return groups.some(g => g.role !== 'player')
          ? { text: 'Создай матч в приложении.', keyboard: { inline_keyboard: [[{ text: 'Создать матч', url: miniAppLink(env, 'newmatch') }], menuRow] } }
          : connectHint('Создать матч может организатор группы. Чтобы создавать матчи, добавь бота в свою группу администратором и отправь в ней /bind или попроси организатора назначить тебя.');
      default: return homeScreen(user, groups);
    }
  };

  const options = (screen: Screen) => ({ parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true }, reply_markup: screen.keyboard });
  /** Перерисовывает сообщение под нажатой кнопкой; повторное нажатие без изменений — не ошибка. */
  const redraw = async (ctx: Context, screen: Screen) => {
    try { await ctx.editMessageText(screen.text, options(screen)); }
    catch (e) { if (!(e instanceof GrammyError && /message is not modified/i.test(e.description))) throw e; }
  };

  const perform = async (ctx: Context, action: Action, joinId?: number) => {
    const me = await identify(ctx, joinId);
    if (!me) return;
    const screen = await screenOf(action, me.user, me.groups);
    await ctx.reply(screen.text, options(screen));
  };

  privateChat.command('start', async ctx => {
    const linked = /^c([1-9]\d*)_(\w+)$/.exec(ctx.match);
    await perform(ctx, actionOf(linked?.[2] ?? ctx.match), linked ? Number(linked[1]) : undefined);
  });
  for (const action of actions.filter(a => a !== 'start')) privateChat.command(action, ctx => perform(ctx, action));

  privateChat.callbackQuery(/^m:(home|matches|payments|settings|help)$/, async ctx => {
    const me = await identify(ctx);
    if (!me) return;
    await ctx.answerCallbackQuery();
    await redraw(ctx, await screenOf(ctx.match[1] === 'home' ? 'start' : ctx.match[1] as Action, me.user, me.groups));
  });

  // Запись из личного чата: группа берётся из самого матча, членство подтверждает Telegram.
  privateChat.callbackQuery(/^m([jl]):([1-9]\d*):([hmc])$/, async ctx => {
    const [, kind, id, origin] = ctx.match;
    const user = await upsertTgUser(deps.db, ctx.from, deps.now());
    const event = await getEvent(deps.db, Number(id));
    const community = event ? await getCommunity(deps.db, event.communityId) : null;
    if (!event || !community || !(await confirmedMembership(deps.db, makeTgClient(env), community, user, deps.now(), env.ADMIN_TG_ID))) {
      return void await ctx.answerCallbackQuery({ text: 'Этот матч тебе недоступен' });
    }
    const d = { db: deps.db, now: deps.now(), sync: deps.sync };
    const text = kind === 'j' ? joinAnswer(await joinEvent(d, event.id, user.id)) : leaveAnswer((await leaveEvent(d, event.id, user.id)).kind);
    await ctx.answerCallbackQuery({ text });
    if (origin === 'c') {
      const view = await loadEventView(deps.db, event.id);
      if (!view) return;
      const card = matchCard(env, view, placeIn(view, user.tgId));
      return void await redraw(ctx, { text: card.html, keyboard: card.keyboard! });
    }
    const groups = await confirmedMemberships(deps.db, makeTgClient(env), env, user, deps.now());
    await redraw(ctx, await screenOf(origin === 'h' ? 'start' : 'matches', user, groups));
  });

  // Legacy buttons carried a group id (notify:<id>:0|1); the setting is personal, so the id is ignored.
  privateChat.callbackQuery(/^notify:(?:[1-9]\d*:)?([01])$/, async ctx => {
    if (!ctx.from) return;
    const user = await upsertTgUser(deps.db, ctx.from, deps.now());
    const enabled = ctx.match[1] === '1';
    await deps.db.update(users).set({ notificationsEnabled: enabled }).where(eq(users.id, user.id));
    await ctx.answerCallbackQuery({ text: enabled ? 'Уведомления включены' : 'Уведомления выключены' });
    await redraw(ctx, { text: settingsText(enabled, true), keyboard: settingsKeyboard(env, enabled) });
  });
  privateChat.on('message:entities:bot_command', ctx => ctx.reply(`Такой команды нет.\n\n${helpText}`, { parse_mode: 'HTML', reply_markup: appKeyboard(env, 'Открыть команды', 'matches') }));
  // Обычное сообщение без команды: вместо молчания показываем меню.
  privateChat.on('message:text', ctx => perform(ctx, 'start'));

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
