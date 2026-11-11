import { TIME_ZONE, availabilityDates, emptyWeekly, resolveAvailability, todayAlmaty, weekdayOf, type AvailabilityMark, type WeeklyAvailability } from '@altynka/core';
import { and, asc, eq, exists, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { availabilityDays, availabilityWeekly, communities, memberships, users } from '../db/schema';
import { availabilityReminder } from '../render/personal';
import { TgForbidden, TgRejected, type TgClient } from '../telegram/client';
import type { LinkEnv } from '../telegram/links';

/** Столько человек получает напоминание за один прогон крона: с запасом до лимитов подзапросов и Telegram. */
export const REMINDER_BATCH = 10;
/** Окно рассылки в понедельник по Алматы: с 9:00 до 13:00. Крон раз в 5 минут успевает обойти всех. */
const FROM_HOUR = 9;
const UNTIL_HOUR = 13;

const hourAlmaty = (now: number) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(now));

export interface ReminderResult { sent: number; skipped: number; failed: number }

/**
 * Утром в понедельник бот просит отметить дни на неделю: один раз в неделю каждому, у кого включены
 * уведомления и есть группа. У кого все дни уже отмечены, сообщение не приходит.
 */
export async function sendAvailabilityReminders(d: { db: Db; now: number; tg: TgClient; env: LinkEnv }): Promise<ReminderResult> {
  const result: ReminderResult = { sent: 0, skipped: 0, failed: 0 };
  const today = todayAlmaty(new Date(d.now));
  const hour = hourAlmaty(d.now);
  if (weekdayOf(today) !== 0 || hour < FROM_HOUR || hour >= UNTIL_HOUR) return result;
  const people = await d.db.select({ id: users.id, tgId: users.tgId }).from(users)
    .where(and(
      eq(users.notificationsEnabled, true), eq(users.pmAvailable, true),
      or(isNull(users.availabilityAskedOn), lt(users.availabilityAskedOn, today)),
      exists(d.db.select({ id: memberships.userId }).from(memberships)
        .innerJoin(communities, and(eq(communities.id, memberships.communityId), eq(communities.active, true)))
        .where(and(eq(memberships.userId, users.id), eq(memberships.active, true)))),
    ))
    .orderBy(asc(users.id)).limit(REMINDER_BATCH);
  if (!people.length) return result;
  const ids = people.map(p => p.id);
  const dates = availabilityDates(today);
  const weekly = new Map<number, WeeklyAvailability>();
  for (const row of await d.db.select().from(availabilityWeekly).where(inArray(availabilityWeekly.userId, ids))) {
    if (!weekly.has(row.userId)) weekly.set(row.userId, emptyWeekly());
    weekly.get(row.userId)![row.weekday] = { status: row.status, parts: [] };
  }
  const marked = new Map<number, Record<string, AvailabilityMark>>();
  for (const row of await d.db.select().from(availabilityDays).where(and(inArray(availabilityDays.userId, ids), gte(availabilityDays.date, today)))) {
    if (!marked.has(row.userId)) marked.set(row.userId, {});
    marked.get(row.userId)![row.date] = { status: row.status, parts: [] };
  }
  const done = (id: number, set: { pmAvailable?: boolean } = {}) => d.db.update(users).set({ availabilityAskedOn: today, ...set }).where(eq(users.id, id));
  for (const person of people) {
    const full = dates.every(date => resolveAvailability(weekly.get(person.id) ?? emptyWeekly(), marked.get(person.id) ?? {}, date));
    if (full) { await done(person.id); result.skipped++; continue; }
    try {
      const message = availabilityReminder(d.env);
      await d.tg.sendMessage(person.tgId, message.html, { keyboard: message.keyboard });
      await done(person.id);
      result.sent++;
    } catch (e) {
      if (e instanceof TgForbidden) { await done(person.id, { pmAvailable: false }); result.skipped++; continue; }
      if (e instanceof TgRejected) { await done(person.id); result.skipped++; continue; }
      // Лимит Telegram или сеть: остальные получат сообщение в следующем прогоне крона.
      result.failed++;
      break;
    }
  }
  return result;
}
