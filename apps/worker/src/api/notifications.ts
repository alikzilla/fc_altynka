import { lineStatus, type NotificationsDto, type NotificationTaskDto } from '@altynka/core';
import { and, asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../auth/middleware';
import { billLines, bills, events, memberships, skillAssessments } from '../db/schema';

export const notificationsApi = new Hono<AppEnv>();

notificationsApi.get('/notifications', async c => {
  const { db } = c.get('deps');
  const communityId = c.get('community').id;
  const debts = await db.select({
    lineId: billLines.id,
    eventId: events.id,
    date: events.date,
    place: events.place,
    amount: billLines.amount,
    paidAmount: billLines.paidAmount,
    receiverName: memberships.displayName,
  }).from(billLines)
    .innerJoin(bills, eq(bills.id, billLines.billId))
    .innerJoin(events, eq(events.id, bills.eventId))
    .innerJoin(memberships, and(eq(memberships.userId, bills.receiverUserId), eq(memberships.communityId, communityId)))
    .where(and(
      eq(events.communityId, communityId),
      eq(billLines.userId, c.get('user').id),
      eq(bills.status, 'open'),
      sql`${billLines.amount} > coalesce(${billLines.paidAmount}, 0)`,
    )).orderBy(asc(events.date), asc(events.id));
  // Payments are first, then collecting games; each category is ordered by date/id.
  const tasks: NotificationTaskDto[] = debts.map(row => ({
    kind: 'payment',
    id: `payment:${row.lineId}`,
    eventId: row.eventId,
    date: row.date,
    place: row.place,
    due: lineStatus(row.amount, row.paidAmount).due,
    receiverName: row.receiverName ?? 'Получатель',
  }));
  const reviews = await db.all<{ eventId: number; date: string; place: string | null; closesAt: number }>(sql`
    SELECT e.id AS eventId, e.date, e.place, r.closes_at AS closesAt
    FROM match_reviews r JOIN events e ON e.id = r.event_id
    JOIN match_participants p ON p.event_id = r.event_id AND p.user_id = ${c.get('user').id}
    LEFT JOIN review_submissions s ON s.event_id = r.event_id AND s.user_id = p.user_id
    WHERE e.community_id = ${communityId} AND e.status <> 'cancelled' AND r.closes_at > ${c.get('deps').now}
      AND s.user_id IS NULL ORDER BY r.closes_at, e.id`);
  tasks.push(...reviews.map(row => ({ kind: 'review' as const, id: `review:${row.eventId}`, ...row })));
  const assessed = await db.select({ userId: skillAssessments.userId }).from(skillAssessments)
    .where(and(eq(skillAssessments.communityId, communityId), eq(skillAssessments.userId, c.get('user').id))).limit(1);
  if (!assessed.length) tasks.push({ kind: 'skills', id: 'skills' });
  if (c.get('role') !== 'player') {
    const collecting = await db.select({ eventId: events.id, date: events.date, place: events.place }).from(events)
      .where(and(eq(events.communityId, communityId), eq(events.status, 'collecting')))
      .orderBy(asc(events.date), asc(events.id));
    for (const row of collecting) tasks.push({ kind: 'schedule', id: `schedule:${row.eventId}`, ...row });
  }
  return c.json<NotificationsDto>({ tasks });
});
