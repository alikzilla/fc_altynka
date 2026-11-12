import {
  DAY_PARTS, availabilityDates, normalizeMark, todayAlmaty, weekStartsAt,
  type AvailabilityDto, type AvailabilityMark, type AvailabilityPersonDto, type AvailabilitySummaryDto, type DayPart,
} from '@altynka/core';
import { and, eq, gte, lte, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { availabilityDays, memberships, users, type CommunityRow } from '../db/schema';

/** «Могу» без окон осталось от первых отметок, когда время было необязательным: читается как весь день. */
export function toMark(row: { status: 'yes' | 'no'; parts: string }): AvailabilityMark {
  const parts = row.parts.split(',').filter((p): p is DayPart => (DAY_PARTS as readonly string[]).includes(p));
  return normalizeMark({ status: row.status, parts: row.status === 'yes' && !parts.length ? DAY_PARTS : parts });
}

export async function getAvailability(db: Db, userId: number, now: number): Promise<AvailabilityDto> {
  const today = todayAlmaty(new Date(now));
  const since = weekStartsAt(today);
  const marks = new Map<string, AvailabilityMark>();
  let markedThisWeek = false;
  // Прошедшие дни этой недели тоже считаются: отметил в понедельник — до следующего понедельника просьбы нет.
  for (const row of await db.select().from(availabilityDays).where(and(eq(availabilityDays.userId, userId), or(gte(availabilityDays.date, today), gte(availabilityDays.updatedAt, since))))) {
    if (row.date >= today) marks.set(row.date, toMark(row));
    if (row.updatedAt >= since) markedThisWeek = true;
  }
  return { days: availabilityDates(today).map(date => ({ date, mark: marks.get(date) ?? null })), markedThisWeek };
}

/** Отметка на дату; null возвращает день к «не указано». */
export async function saveDay(db: Db, userId: number, date: string, mark: AvailabilityMark | null, now: number): Promise<void> {
  if (!mark) {
    await db.delete(availabilityDays).where(and(eq(availabilityDays.userId, userId), eq(availabilityDays.date, date)));
    return;
  }
  const set = { status: mark.status, parts: normalizeMark(mark).parts.join(','), updatedAt: now };
  await db.insert(availabilityDays).values({ userId, date, ...set })
    .onConflictDoUpdate({ target: [availabilityDays.userId, availabilityDays.date], set });
}

interface MemberAvailability { userId: number; name: string; mark: AvailabilityMark | null }

/**
 * Отметки активных участников группы на каждую из дат. Два запроса на любое число дат и людей;
 * соединения вместо списков id: большая группа превысила бы лимит связанных параметров D1.
 */
async function membersOn(db: Db, communityId: number, dates: string[]): Promise<Map<string, MemberAvailability[]>> {
  const member = and(eq(memberships.communityId, communityId), eq(memberships.active, true));
  const people = await db.select({ userId: users.id, name: users.displayName }).from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId)).where(member);
  const rows = dates.length ? await db.select({ row: availabilityDays }).from(memberships)
    .innerJoin(availabilityDays, eq(availabilityDays.userId, memberships.userId))
    .where(and(member, gte(availabilityDays.date, dates[0]), lte(availabilityDays.date, dates[dates.length - 1]))) : [];
  const marks = new Map(rows.map(({ row }) => [`${row.userId}:${row.date}`, toMark(row)]));
  return new Map(dates.map(date => [date, people.map(p => ({ ...p, mark: marks.get(`${p.userId}:${date}`) ?? null }))]));
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
