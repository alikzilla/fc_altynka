import { escapeHtml, formatDateRu, lineStatus } from '@altynka/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Bot, Context } from 'grammy';
import { billLines, bills, events, users } from '../db/schema';
import { effectiveRole, ensureMembership, getCommunity, upsertTgUser } from '../domain/members';
import type { Env } from '../env';
import { makeTgClient } from '../telegram/client';
import { miniAppLink } from '../telegram/links';
import type { BotDeps } from './bot';
import { appKeyboard, helpText, mainKeyboard, organizerCommands, playerCommands, settingsKeyboard, settingsText, welcomeText } from './presentation';

const money = (amount: number) => `${amount.toLocaleString('ru-RU').replace(/\s/g, ' ')} ₸`;

export function registerPrivateCommands(bot: Bot, env: Env, deps: BotDeps): void {
  const privateChat = bot.chatType('private');
  // Receiving a private update proves reachability; it never changes the subscription.
  privateChat.use(async (ctx, next) => {
    if (ctx.from && (ctx.message || ctx.callbackQuery)) {
      const user = await upsertTgUser(deps.db, ctx.from, deps.now());
      await deps.db.update(users).set({ pmAvailable: true }).where(eq(users.id, user.id));
    }
    await next();
  });

  const updateMenu = async (ctx: Context, organizer: boolean) => {
    if (!ctx.from) return;
    try {
      await ctx.api.setMyCommands(organizer ? organizerCommands : playerCommands, { scope: { type: 'chat', chat_id: ctx.from.id } });
    } catch {
      // Transport error messages may contain the bot token in their request URL.
      console.warn('Telegram private command menu could not be updated.');
    }
  };
  const member = async (ctx: Context) => {
    if (!ctx.from) return null;
    const user = await upsertTgUser(deps.db, ctx.from, deps.now());
    const community = await getCommunity(deps.db);
    const present = community && await makeTgClient(env).isMember(community.tgChatId, ctx.from.id);
    if (!present || !community) {
      await updateMenu(ctx, false);
      return null;
    }
    const membership = await ensureMembership(deps.db, community.id, user.id, deps.now());
    const role = effectiveRole(env, user, membership);
    await updateMenu(ctx, role !== 'player');
    return { user, community, role };
  };
  const denied = (ctx: Context) => ctx.reply('Матчи и платежи доступны участникам группы FC Altynka. Открой группу команды и проверь, что ты в ней состоишь.');
  const showSettings = async (ctx: Context) => {
    if (!ctx.from) return;
    const [user] = await deps.db.select().from(users).where(eq(users.tgId, ctx.from.id));
    await ctx.reply(settingsText(user.notificationsEnabled, user.pmAvailable), { parse_mode: 'HTML', reply_markup: settingsKeyboard(env, user.notificationsEnabled) });
  };
  const showNewMatch = async (ctx: Context, m: Awaited<ReturnType<typeof member>>) => {
    if (!m) { await denied(ctx); return; }
    if (m.role === 'player') { await ctx.reply('Создать матч может организатор.'); return; }
    await ctx.reply('Создай матч в приложении.', { reply_markup: appKeyboard(env, 'Создать матч', 'newmatch') });
  };

  privateChat.command('start', async ctx => {
    const m = await member(ctx);
    if (ctx.match === 'settings') { await showSettings(ctx); return; }
    if (ctx.match === 'newmatch') { await showNewMatch(ctx, m); return; }
    if (ctx.match === 'payments') {
      await ctx.reply('Твои открытые платежи доступны в приложении или по команде /payments.', { reply_markup: appKeyboard(env, 'Мои платежи', 'payments') });
      return;
    }
    await ctx.reply(welcomeText, { parse_mode: 'HTML', reply_markup: mainKeyboard(env) });
  });
  privateChat.command('settings', async ctx => { await member(ctx); await showSettings(ctx); });
  // Only this callback prefix is consumed; payment and event handlers continue normally.
  privateChat.callbackQuery(/^notify:[01]$/, async ctx => {
    const enabled = ctx.callbackQuery.data === 'notify:1';
    await deps.db.update(users).set({ notificationsEnabled: enabled }).where(eq(users.tgId, ctx.from.id));
    await ctx.answerCallbackQuery({ text: enabled ? 'Уведомления включены' : 'Уведомления выключены' });
    await ctx.editMessageText(settingsText(enabled, true), { parse_mode: 'HTML', reply_markup: settingsKeyboard(env, enabled) });
  });

  privateChat.command('matches', async ctx => {
    const m = await member(ctx);
    if (!m) { await denied(ctx); return; }
    const rows = await deps.db.select().from(events).where(and(eq(events.communityId, m.community.id), inArray(events.status, ['collecting', 'scheduled'])))
      .orderBy(asc(events.date), asc(events.id)).limit(8);
    const text = rows.length ? '<b>Предстоящие матчи</b>\n\n' + rows.map(e => `${formatDateRu(e.date)} · ${e.startTime ?? 'время не назначено'}${e.place ? ` · ${escapeHtml(e.place)}` : ''}`).join('\n') : 'Пока нет активных матчей.';
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      ...rows.map(e => [{ text: `Открыть матч · ${formatDateRu(e.date)}`, url: miniAppLink(env, `e${e.id}`) }]),
      [{ text: 'Все матчи', url: miniAppLink(env, 'matches') }],
    ] } });
  });

  privateChat.command('payments', async ctx => {
    const m = await member(ctx);
    if (!m) { await denied(ctx); return; }
    const rows = await deps.db.select({ eventId: events.id, date: events.date, amount: billLines.amount, paidAmount: billLines.paidAmount, units: billLines.units })
      .from(billLines).innerJoin(bills, eq(bills.id, billLines.billId)).innerJoin(events, eq(events.id, bills.eventId))
      .where(and(eq(events.communityId, m.community.id), eq(billLines.userId, m.user.id), eq(bills.status, 'open'), sql`${billLines.amount} > coalesce(${billLines.paidAmount}, 0)`))
      .orderBy(asc(events.date), asc(events.id)).limit(8);
    const text = rows.length ? '<b>Мои платежи</b>\n\n' + rows.map(r => `${formatDateRu(r.date)} · осталось ${money(lineStatus(r.amount, r.paidAmount).due)}${r.units > 1 ? ` · за тебя и гостей: ${r.units - 1}` : ''}`).join('\n') : 'Нет открытых платежей.';
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      ...rows.map(r => [{ text: `Открыть оплату · ${formatDateRu(r.date)}`, url: miniAppLink(env, `b${r.eventId}`) }]),
      [{ text: 'Все платежи', url: miniAppLink(env, 'payments') }],
    ] } });
  });
  privateChat.command('newmatch', async ctx => {
    await showNewMatch(ctx, await member(ctx));
  });
  privateChat.command('help', async ctx => {
    await member(ctx);
    await ctx.reply(helpText, { reply_markup: appKeyboard(env, 'Открыть матчи', 'matches') });
  });
  privateChat.on('message:entities:bot_command', async ctx => {
    await ctx.reply(`Такой команды нет.\n\n${helpText}`, { reply_markup: appKeyboard(env, 'Открыть матчи', 'matches') });
  });

  const group = bot.chatType(['group', 'supergroup']);
  group.command(['start', 'payments', 'settings', 'newmatch'], async ctx => {
    const command = ctx.message.text.slice(1).split(/[\s@]/)[0];
    await ctx.reply('Открой бота в личном чате.', { reply_markup: { inline_keyboard: [[{ text: 'Открыть личный чат', url: `https://t.me/${env.BOT_USERNAME}?start=${command}` }]] } });
  });
  group.command('matches', ctx => ctx.reply('Запись и список матчей — в приложении.', { reply_markup: appKeyboard(env, 'Открыть матчи', 'matches') }));
  group.command('help', ctx => ctx.reply('Запись и выход — кнопками под нужным матчем. Личные платежи и уведомления доступны в личном чате бота.', { reply_markup: appKeyboard(env, 'Открыть матчи', 'matches') }));
}
