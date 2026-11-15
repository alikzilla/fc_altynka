import { awardWinners, type AwardTally, type MatchAwardResults } from '@altynka/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';

/** D1 allows 100 bound parameters per query. */
const EVENT_CHUNK = 50;
const idList = (ids: number[]) => sql.join(ids.map(id => sql`${id}`), sql`, `);

/**
 * Winners per match, worked out from the stored votes on every read. The caller is responsible for
 * passing only matches whose voting has closed; a match nobody picked awards in is absent from the map.
 */
export async function awardsByEvent(db: Db, eventIds: number[]): Promise<Map<number, MatchAwardResults>> {
  const ids = [...new Set(eventIds)];
  const out = new Map<number, MatchAwardResults>();
  for (let i = 0; i < ids.length; i += EVENT_CHUNK) {
    const chunk = ids.slice(i, i + EVENT_CHUNK);
    const [tallies, averages] = await Promise.all([
      db.all<AwardTally & { eventId: number }>(sql`
        SELECT event_id AS eventId, award, recipient_id AS userId, count(*) AS votes
        FROM award_votes WHERE event_id IN (${idList(chunk)}) GROUP BY event_id, award, recipient_id`),
      // The tie-break uses every rating of the match, below the publishing threshold too; it never leaves the server.
      db.all<{ eventId: number; userId: number; score: number }>(sql`
        SELECT event_id AS eventId, recipient_id AS userId, avg(score) AS score
        FROM player_votes WHERE event_id IN (${idList(chunk)}) GROUP BY event_id, recipient_id`),
    ]);
    for (const eventId of new Set(tallies.map(t => t.eventId))) {
      out.set(eventId, awardWinners(tallies.filter(t => t.eventId === eventId),
        new Map(averages.filter(a => a.eventId === eventId).map(a => [a.userId, a.score]))));
    }
  }
  return out;
}

