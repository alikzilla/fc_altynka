import { aggregatePlayerStatistics, summarizePlayerProtocol, teamColorsFor, MIN_REVIEW_VOTES, type GameState, type PlayerMeetingStatistics } from '@altynka/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';

/** Call only after profile access is established; a peer sees shared active groups only. */
export async function playerGameStatistics(db: Db, userId: number, viewerId: number, now: number) {
  const scope = userId === viewerId ? sql`` : sql`AND c.active = 1 AND EXISTS (
    SELECT 1 FROM memberships mine JOIN memberships theirs ON theirs.community_id = mine.community_id
    WHERE mine.community_id = e.community_id AND mine.user_id = ${viewerId} AND mine.active = 1
      AND theirs.user_id = ${userId} AND theirs.active = 1)`;
  const rows = await db.all<{eventId:number;date:string;place:string|null;communityId:number;communityTitle:string;state:string;colors:string|null;score:number|null}>(sql`
    SELECT e.id AS eventId,e.date,e.place,c.id AS communityId,c.title AS communityTitle,
      e.game_state_json AS state,e.team_colors AS colors,
      (SELECT CASE WHEN count(v.score) >= ${MIN_REVIEW_VOTES} THEN round(avg(v.score),1) ELSE NULL END
        FROM player_votes v JOIN match_reviews r ON r.event_id=v.event_id
        WHERE v.event_id=e.id AND v.recipient_id=${userId} AND r.closes_at<=${now}) AS score
    FROM events e JOIN communities c ON c.id=e.community_id
    WHERE e.protocol_version=1 AND e.started_at IS NOT NULL AND e.game_state_json IS NOT NULL
      AND e.status<>'cancelled' AND EXISTS (SELECT 1 FROM json_each(e.game_state_json,'$.roster') person
        WHERE json_extract(person.value,'$.userId')=${userId}) ${scope}
    ORDER BY e.date DESC,e.id DESC`);
  const history: PlayerMeetingStatistics[] = [];
  for (const row of rows) {
    const state = JSON.parse(row.state) as GameState;
    const summary = summarizePlayerProtocol(state, userId);
    if (!summary.games) continue;
    history.push({ ...summary, eventId: row.eventId, date: row.date, place: row.place,
      community: { id: row.communityId, title: row.communityTitle }, score: row.score,
      colors: teamColorsFor(state.teamCount, row.colors ? JSON.parse(row.colors) as string[] : null) });
  }
  return { statistics: aggregatePlayerStatistics(history), gameHistory: history.slice(0,20) };
}
