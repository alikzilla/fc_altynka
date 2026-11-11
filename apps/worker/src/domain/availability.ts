import {
  DAY_PARTS, availabilityDates, emptyWeekly, normalizeMark, resolveAvailability, todayAlmaty,
  type AvailabilityDto, type AvailabilityMark, type AvailabilityPersonDto, type AvailabilitySummaryDto, type DayPart, type WeeklyAvailability,
} from '@altynka/core';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { availabilityDays, availabilityWeekly, memberships, users, type CommunityRow } from '../db/schema';

const toMark = (row: { status: 'yes' | 'no'; parts: string }): AvailabilityMark =>
  normalizeMark({ status: row.status, parts: row.parts.split(',').filter((p): p is DayPart => (DAY_PARTS as readonly string[]).includes(p)) });
const partsText = (mark: AvailabilityMark) => normalizeMark(mark).parts.join(',');

export async function getAvailability(db: Db, userId: number, now: number): Promise<AvailabilityDto> {
  const today = todayAlmaty(new Date(now));
  const weekly = emptyWeekly();
  for (const row of await db.select().from(availabilityWeekly).where(eq(availabilityWeekly.userId, userId))) weekly[row.weekday] = toMark(row);
  const overrides: Record<string, AvailabilityMark> = {};
  for (const row of await db.select().from(availabilityDays).where(and(eq(availabilityDays.userId, userId), gte(availabilityDays.date, today)))) overrides[row.date] = toMark(row);
  return {
    weekly,
    days: availabilityDates(today).map(date => ({ date, mark: resolveAvailability(weekly, overrides, date), override: date in overrides })),
  };
}

/** Заменяет весь обычный график; null в дне недели — «не указано». */
export async function saveWeekly(db: Db, userId: number, weekly: WeeklyAvailability): Promise<void> {
  const rows = weekly.flatMap((mark, weekday) => mark ? [{ userId, weekday, status: mark.status, parts: partsText(mark) }] : []);
  await db.batch([
    db.delete(availabilityWeekly).where(eq(availabilityWeekly.userId, userId)),
    ...(rows.length ? [db.insert(availabilityWeekly).values(rows)] : []),
  ]);
}

/** Отметка на дату; null возвращает день к обычному графику. */
export async function saveDay(db: Db, userId: number, date: string, mark: AvailabilityMark | null, now: number): Promise<void> {
  if (!mark) {
    await db.delete(availabilityDays).where(and(eq(availabilityDays.userId, userId), eq(availabilityDays.date, date)));
    return;
  }
  const set = { status: mark.status, parts: partsText(mark), updatedAt: now };
  await db.insert(availabilityDays).values({ userId, date, ...set })
    .onConflictDoUpdate({ target: [availabilityDays.userId, availabilityDays.date], set });
}

interface MemberAvailability { userId: number; name: string; mark: AvailabilityMark | null }

/**
 * Отметки активных участников группы на каждую из дат. Три запроса на любое число дат и людей;
 * соединения вместо списков id: большая группа превысила бы лимит связанных параметров D1.
 */
async function membersOn(db: Db, communityId: number, dates: string[]): Promise<Map<string, MemberAvailability[]>> {
  const member = and(eq(memberships.communityId, communityId), eq(memberships.active, true));
  const people = await db.select({ userId: users.id, name: users.displayName }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId)).where(member);
  const weeklyRows = await db.select({ row: availabilityWeekly }).from(memberships)
    .innerJoin(availabilityWeekly, eq(availabilityWeekly.userId, memberships.userId)).where(member);
  const dayRows = dates.length ? await db.select({ row: availabilityDays }).from(memberships)
    .innerJoin(availabilityDays, eq(availabilityDays.userId, memberships.userId))
    .where(and(member, gte(availabilityDays.date, dates[0]), lte(availabilityDays.date, dates[dates.length - 1]))) : [];
  const weekly = new Map<number, WeeklyAvailability>();
  for (const { row } of weeklyRows) {
    if (!weekly.has(row.userId)) weekly.set(row.userId, emptyWeekly());
    weekly.get(row.userId)![row.weekday] = toMark(row);
  }
  const overrides = new Map<number, Record<string, AvailabilityMark>>();
  for (const { row } of dayRows) {
    if (!overrides.has(row.userId)) overrides.set(row.userId, {});
    overrides.get(row.userId)![row.date] = toMark(row);
  }
  return new Map(dates.map(date => [date, people.map(p => ({
    ...p, mark: resolveAvailability(weekly.get(p.userId) ?? emptyWeekly(), overrides.get(p.userId) ?? {}, date),
  }))]));
}

/** Кто из группы отметил дату: «не могу» — о новом матче не пишем, «могу» — напоминаем об отметке. */
export async function availabilityOn(db: Db, communityId: number, date: string): Promise<{ away: Set<number>; free: Set<number> }> {
  const members = (await membersOn(db, communityId, [date])).get(date)!;
  const ids = (status: 'yes' | 'no') => new Set(members.filter(m => m.mark?.status === status).map(m => m.userId));
  return { away: ids('no'), free: ids('yes') };
}

export async function availabilitySummary(db: Db, community: CommunityRow, now: number): Promise<AvailabilitySummaryDto> {
  const byDate = await membersOn(db, community.id, availabilityDates(todayAlmaty(new Date(now))));
  const days = [...byDate].map(([date, members]) => {
    const people = (status: 'yes' | 'no'): AvailabilityPersonDto[] => members
      .filter(m => m.mark?.status === status)
      .map(m => ({ userId: m.userId, name: m.name, parts: m.mark!.parts }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return { date, yes: people('yes'), no: people('no'), unknown: members.filter(m => !m.mark).length };
  });
  return { community: { id: community.id, title: community.title }, days };
}
