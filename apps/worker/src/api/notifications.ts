import { lineStatus, type NotificationsDto, type NotificationTaskDto } from '@altynka/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../auth/middleware';
import { billLines, bills, communities, events, skillAssessments, users } from '../db/schema';
import { canManage } from '../domain/events';
import { activeMemberships } from '../domain/members';

export const notificationsApi = new Hono<AppEnv>();

notificationsApi.get('/notifications', async c => {
  const { db, now } = c.get('deps');
  const me = c.get('user');
  // Debts follow the bill line, not membership: leaving the group never hides what is owed.
  const debts = await db.select({
    lineId: billLines.id,
    eventId: events.id,
    date: events.date,
    place: events.place,
    amount: billLines.amount,
    paidAmount: billLines.paidAmount,
    receiverName: users.displayName,
    communityId: communities.id,
    communityTitle: communities.title,
  }).from(billLines)
    .innerJoin(bills, eq(bills.id, billLines.billId))
    .innerJoin(events, eq(events.id, bills.eventId))
    .innerJoin(communities, eq(communities.id, events.communityId))
    .innerJoin(users, eq(users.id, bills.receiverUserId))
    .where(and(
      eq(billLines.userId, me.id),
      eq(bills.status, 'open'),
      sql`${billLines.amount} > coalesce(${billLines.paidAmount}, 0)`,
    )).orderBy(asc(events.date), asc(events.id));
  // Payments are first, then reviews, the survey and collecting games; each category is ordered by date/id.
  const tasks: NotificationTaskDto[] = debts.map(row => ({
    kind: 'payment',
    id: `payment:${row.lineId}`,
    eventId: row.eventId,
    date: row.date,
    place: row.place,
    due: lineStatus(row.amount, row.paidAmount).due,
    receiverName: row.receiverName ?? 'Получатель',
    community: { id: row.communityId, title: row.communityTitle },
  }));
  // Reviews follow actual participation in the match.
  const reviews = await db.all<{ eventId: number; date: string; place: string | null; closesAt: number; communityId: number; communityTitle: string }>(sql`
    SELECT e.id AS eventId, e.date, e.place, r.closes_at AS closesAt, c.id AS communityId, c.title AS communityTitle
    FROM match_reviews r JOIN events e ON e.id = r.event_id
    JOIN communities c ON c.id = e.community_id
    JOIN match_participants p ON p.event_id = r.event_id AND p.user_id = ${me.id}
    LEFT JOIN review_submissions s ON s.event_id = r.event_id AND s.user_id = p.user_id
    WHERE e.status <> 'cancelled' AND r.closes_at > ${now}
      AND s.user_id IS NULL ORDER BY r.closes_at, e.id`);
  tasks.push(...reviews.map(({ communityId, communityTitle, ...row }) => ({
    kind: 'review' as const, id: `review:${row.eventId}`, ...row, community: { id: communityId, title: communityTitle },
  })));
  const assessed = await db.select({ userId: skillAssessments.userId }).from(skillAssessments)
    .where(eq(skillAssessments.userId, me.id)).limit(1);
  if (!assessed.length) tasks.push({ kind: 'skills', id: 'skills' });
  // Scheduling duties only in groups where this person organizes.
  const managed = (await activeMemberships(db, c.env, me)).filter(m => canManage(m.role)).map(m => m.community);
  if (managed.length) {
    const titles = new Map(managed.map(g => [g.id, g.title]));
    const collecting = await db.select({ eventId: events.id, date: events.date, place: events.place, communityId: events.communityId }).from(events)
      .where(and(inArray(events.communityId, [...titles.keys()]), eq(events.status, 'collecting')))
      .orderBy(asc(events.date), asc(events.id));
    for (const { communityId, ...row } of collecting) {
      tasks.push({ kind: 'schedule', id: `schedule:${row.eventId}`, ...row, community: { id: communityId, title: titles.get(communityId)! } });
    }
  }
  return c.json<NotificationsDto>({ tasks });
});
