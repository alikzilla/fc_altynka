import {
  composeMatchFeed, composeTopRatedPost, composeUpcomingPost, FEED_MATCH_KINDS, FEED_UPCOMING_KINDS, MIN_REVIEW_VOTES, registrationOpen,
  splitQueue, type CommunityDto, type FeedDraft, type FeedDto, type FeedKind, type FeedUpcomingKind, type GameState, type RecentVariants,
} from '@altynka/core';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, feedPosts, signups, type EventRow } from '../db/schema';
import type { Deps } from './events';

const FEED_PAGE = 30;
/** How long after voting closes the best-rated post may still appear. */
const VOTES_WINDOW_MS = 30 * 86_400_000;

/** The feed decorates the match; it must never fail a signup, a result or a finish. */
export async function feedSafely(task: () => Promise<unknown>): Promise<void> {
  try { await task(); }
  catch (error) { console.error(JSON.stringify({ event: 'feed_failed', message: error instanceof Error ? error.message : String(error) })); }
}

const event = async (db: Db, eventId: number): Promise<EventRow | null> => (await db.select().from(events).where(eq(events.id, eventId)))[0] ?? null;

/** Phrasings the group has read lately, without the posts of the match being rewritten. */
async function recentVariants(db: Db, communityId: number, exceptEventId: number): Promise<RecentVariants> {
  const rows = await db.select({ kind: feedPosts.kind, variant: feedPosts.variant }).from(feedPosts)
    .where(and(eq(feedPosts.communityId, communityId), ne(feedPosts.eventId, exceptEventId)))
    .orderBy(sql`${feedPosts.createdAt} DESC, ${feedPosts.id} DESC`).limit(80);
  const recent: Partial<Record<FeedKind, number[]>> = {};
  for (const row of rows) (recent[row.kind] ??= []).push(row.variant);
  return recent;
}

const row = (ev: EventRow, draft: FeedDraft, position: number, createdAt: number) => ({
  communityId: ev.communityId, eventId: ev.id, kind: draft.kind, slot: draft.slot, variant: draft.variant, position,
  text: draft.text, highlightsJson: JSON.stringify(draft.highlights), userId: draft.userId, teamColor: draft.teamColor, createdAt,
});

/**
 * Rewrite the stories of a finished match from its current protocol. Called on finish and on every later
 * correction of a result, so the feed never tells a score that the table no longer shows.
 */
export async function publishMatchFeed(d: Deps, eventId: number): Promise<void> {
  const ev = await event(d.db, eventId);
  if (!ev || ev.protocolVersion !== 1 || ev.completedAt === null || !ev.gameStateJson) return;
  const state = JSON.parse(ev.gameStateJson) as GameState;
  let drafts: FeedDraft[] = [];
  if (ev.status !== 'cancelled' && state.games.length) {
    const earlier = await d.db.all<{ state: string }>(sql`
      SELECT game_state_json AS state FROM events
      WHERE community_id = ${ev.communityId} AND protocol_version = 1 AND completed_at IS NOT NULL
        AND game_state_json IS NOT NULL AND status <> 'cancelled'
        AND (date < ${ev.date} OR (date = ${ev.date} AND id < ${ev.id}))
      ORDER BY date, id`);
    drafts = composeMatchFeed({
      eventId, state, colors: ev.teamColors ? JSON.parse(ev.teamColors) as string[] : null,
      previous: earlier.map(r => JSON.parse(r.state) as GameState),
      recent: await recentVariants(d.db, ev.communityId, eventId),
    });
  }
  // Pre-match news gives way to the match itself.
  const stale = d.db.delete(feedPosts).where(and(eq(feedPosts.eventId, eventId), inArray(feedPosts.kind, [...FEED_MATCH_KINDS, ...FEED_UPCOMING_KINDS])));
  await d.db.batch([stale, ...drafts.map((draft, i) => d.db.insert(feedPosts).values(row(ev, draft, i, ev.completedAt!)))]);
}

/** One post per kind and match; a changed time or place replaces the earlier wording. */
export async function publishUpcomingPost(d: Deps, eventId: number, kind: FeedUpcomingKind): Promise<void> {
  const ev = await event(d.db, eventId);
  if (!ev || !registrationOpen(ev, d.now)) return;
  const draft = composeUpcomingPost(kind, {
    eventId, date: ev.date, startTime: ev.startTime, place: ev.place, limit: ev.baseLimit, teamCount: ev.teamCount,
    colors: ev.teamColors ? JSON.parse(ev.teamColors) as string[] : null, recent: await recentVariants(d.db, ev.communityId, eventId),
  });
  const values = row(ev, draft, 0, d.now);
  const insert = d.db.insert(feedPosts).values(values);
  await (kind === 'scheduled'
    ? insert.onConflictDoUpdate({ target: [feedPosts.eventId, feedPosts.slot], set: { text: values.text, variant: values.variant, highlightsJson: values.highlightsJson, createdAt: values.createdAt } })
    : insert.onConflictDoNothing());
}

/** «Состав собран» lives only while the main squad is really full and signup is still open. */
export async function refreshSquadPost(d: Deps, eventId: number): Promise<void> {
  const ev = await event(d.db, eventId);
  if (!ev) return;
  if (ev.status === 'cancelled') { await clearEventFeed(d, eventId); return; }
  if (!registrationOpen(ev, d.now)) return;
  const queue = splitQueue(await d.db.select().from(signups).where(and(eq(signups.eventId, eventId), isNull(signups.leftAt))), ev.baseLimit);
  if (queue.main.length >= ev.baseLimit) await publishUpcomingPost(d, eventId, 'squad_full');
  else await d.db.delete(feedPosts).where(and(eq(feedPosts.eventId, eventId), eq(feedPosts.kind, 'squad_full')));
}

/** A cancelled match leaves nothing behind in the feed. */
export async function clearEventFeed(d: Deps, eventId: number): Promise<void> {
  await d.db.delete(feedPosts).where(eq(feedPosts.eventId, eventId));
}

/**
 * Voting closes by the clock, not by a request, so the best-rated post is written when somebody next reads
 * the feed. Only published aggregates (enough votes) are used; who voted how never leaves the database.
 */
export async function publishClosedVotes(d: Deps, communityIds: number[]): Promise<void> {
  if (!communityIds.length) return;
  const rows = await d.db.all<{ eventId: number; closesAt: number; userId: number; name: string; score: number }>(sql`
    SELECT e.id AS eventId, r.closes_at AS closesAt, v.recipient_id AS userId, p.name AS name, round(avg(v.score), 1) AS score
    FROM match_reviews r JOIN events e ON e.id = r.event_id
    JOIN player_votes v ON v.event_id = r.event_id
    JOIN match_participants p ON p.event_id = v.event_id AND p.user_id = v.recipient_id
    WHERE e.community_id IN (${sql.join(communityIds.map(id => sql`${id}`), sql`, `)}) AND e.status <> 'cancelled'
      AND r.closes_at <= ${d.now} AND r.closes_at > ${d.now - VOTES_WINDOW_MS}
      AND NOT EXISTS (SELECT 1 FROM feed_posts f WHERE f.event_id = e.id AND f.kind = 'top_rated')
    GROUP BY e.id, v.recipient_id HAVING count(*) >= ${MIN_REVIEW_VOTES}
    ORDER BY e.id, score DESC, p.name`);
  const byEvent = new Map<number, typeof rows>();
  for (const r of rows) byEvent.set(r.eventId, [...byEvent.get(r.eventId) ?? [], r]);
  for (const [eventId, scores] of byEvent) {
    const ev = await event(d.db, eventId);
    if (!ev) continue;
    const best = scores[0].score;
    const draft = composeTopRatedPost({
      eventId, date: ev.date, score: best, winners: scores.filter(s => s.score === best),
      recent: await recentVariants(d.db, ev.communityId, eventId),
    });
    if (draft) await d.db.insert(feedPosts).values(row(ev, draft, 0, scores[0].closesAt)).onConflictDoNothing();
  }
}

/** Latest posts of all the person's groups, newest first; inside one match the winner leads. */
export async function listFeed(d: Deps, communities: readonly CommunityDto[]): Promise<FeedDto> {
  if (!communities.length) return { posts: [] };
  const ids = communities.map(c => c.id);
  await feedSafely(() => publishClosedVotes(d, ids));
  const titles = new Map(communities.map(c => [c.id, c.title]));
  const rows = await d.db.select({ post: feedPosts, date: events.date }).from(feedPosts)
    .innerJoin(events, eq(events.id, feedPosts.eventId))
    .where(and(inArray(feedPosts.communityId, ids), ne(events.status, 'cancelled')))
    .orderBy(sql`${feedPosts.createdAt} DESC, ${feedPosts.eventId} DESC, ${feedPosts.position}, ${feedPosts.id}`).limit(FEED_PAGE);
  return { posts: rows.map(({ post, date }) => ({
    id: post.id, kind: post.kind, text: post.text, highlights: JSON.parse(post.highlightsJson) as string[],
    createdAt: post.createdAt, eventId: post.eventId, eventDate: date,
    community: { id: post.communityId, title: titles.get(post.communityId) ?? '' },
    userId: post.userId, teamColor: post.teamColor,
  })) };
}
