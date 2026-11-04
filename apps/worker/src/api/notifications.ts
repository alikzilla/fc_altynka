import { lineStatus, type NotificationsDto, type NotificationTaskDto } from '@altynka/core';
import { and, asc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../auth/middleware';
import { billLines, bills, events, users } from '../db/schema';

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
    receiverName: users.displayName,
  }).from(billLines)
    .innerJoin(bills, eq(bills.id, billLines.billId))
    .innerJoin(events, eq(events.id, bills.eventId))
    .innerJoin(users, eq(users.id, bills.receiverUserId))
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
    receiverName: row.receiverName,
  }));
  if (c.get('role') !== 'player') {
    const collecting = await db.select({ eventId: events.id, date: events.date, place: events.place }).from(events)
      .where(and(eq(events.communityId, communityId), eq(events.status, 'collecting')))
      .orderBy(asc(events.date), asc(events.id));
    for (const row of collecting) tasks.push({ kind: 'schedule', id: `schedule:${row.eventId}`, ...row });
  }
  return c.json<NotificationsDto>({ tasks });
});
