import { and, eq, gt, inArray, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, matchReviews } from '../db/schema';
import type { SyncPort } from '../sync/port';

/** An alarm may have fired while the bot was absent. Keep DO state and restart its queue. */
export async function restoreCommunitySync(db: Db, sync: SyncPort, communityId: number, now: number): Promise<void> {
  const rows = await db.select({ id: events.id }).from(events)
    .leftJoin(matchReviews, eq(matchReviews.eventId, events.id))
    .where(and(eq(events.communityId, communityId), or(
      inArray(events.status, ['collecting', 'scheduled', 'billing']),
      and(inArray(events.status, ['scheduled', 'billing', 'closed']), gt(matchReviews.closesAt, now)),
    )));
  for (const event of rows) await sync.request(event.id, { parts: ['event', 'teams', 'bill'] });
}
