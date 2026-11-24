import {
  AWARDS, composeCeremonyPost, composeMatchFeed, summarizePlayerProtocol, composeTopRatedPost, composeUpcomingPost, FEED_MATCH_KINDS, FEED_REACTIONS, FEED_UPCOMING_KINDS, MIN_AWARD_VOTES, MIN_REVIEW_VOTES, registrationOpen,
  splitQueue, type CeremonyCard, type CeremonyCardDto, type CeremonyStats, type CeremonyWinner, type CommunityDto, type FeedDraft, type FeedDto, type FeedKind, type FeedReaction, type FeedReactionsDto, type FeedUpcomingKind, type GameState, type MatchAwardResults, type RecentVariants,
} from '@altynka/core';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, feedHidden, feedPosts, feedReactions, matchParticipants, signups, users, type EventRow } from '../db/schema';
import type { Deps } from './events';
import { awardsByEvent } from './awards';

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
  payloadJson: draft.payload ? JSON.stringify(draft.payload) : null,
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
  const staleReactions = d.db.delete(feedReactions).where(and(eq(feedReactions.eventId, eventId), inArray(feedReactions.slot, [...FEED_UPCOMING_KINDS])));
  await d.db.batch([stale, staleReactions, ...drafts.map((draft, i) => d.db.insert(feedPosts).values(row(ev, draft, i, ev.completedAt!)))]);
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
  await d.db.batch([
    d.db.delete(feedPosts).where(eq(feedPosts.eventId, eventId)),
    d.db.delete(feedReactions).where(eq(feedReactions.eventId, eventId)),
    d.db.delete(feedHidden).where(eq(feedHidden.eventId, eventId)),
  ]);
}

/** An awards post that names the MVP leads the vote news (position 0) and stands in for the best-rated post. */
const AWARDS_WITH_MVP = 0;
const AWARDS_ONLY = 1;

/**
 * Closed matches that have a prize to announce and no awards post yet. A prize needs two votes for one
 * player, so a match where the votes scattered never enters the list and costs nothing on later reads.
 */
export async function awardsToPublish(d: Deps, communityIds: number[]): Promise<{ eventId: number; closesAt: number }[]> {
  if (!communityIds.length) return [];
  return d.db.all<{ eventId: number; closesAt: number }>(sql`
    SELECT e.id AS eventId, r.closes_at AS closesAt FROM match_reviews r JOIN events e ON e.id = r.event_id
    WHERE e.community_id IN (${sql.join(communityIds.map(id => sql`${id}`), sql`, `)}) AND e.status <> 'cancelled'
      AND r.closes_at <= ${d.now} AND r.closes_at > ${d.now - VOTES_WINDOW_MS}
      AND EXISTS (SELECT 1 FROM award_votes a WHERE a.event_id = e.id GROUP BY a.award, a.recipient_id HAVING count(*) >= ${MIN_AWARD_VOTES})
      AND NOT EXISTS (SELECT 1 FROM feed_posts f WHERE f.event_id = e.id AND f.kind IN ('awards', 'ceremony'))
    ORDER BY e.id`);
}

/**
 * Every winner of a closed vote with what the ceremony and the congratulation tell about them: the name the
 * match roster knows, the winner's own vote count and the numbers of the recorded games, if there are any.
 */
export async function ceremonyWinners(d: Deps, eventId: number, result: MatchAwardResults): Promise<CeremonyWinner[]> {
  const ev = await event(d.db, eventId);
  if (!ev) return [];
  const names = new Map((await d.db.select({ userId: matchParticipants.userId, name: matchParticipants.name }).from(matchParticipants)
    .where(eq(matchParticipants.eventId, eventId))).flatMap(p => p.userId === null ? [] : [[p.userId, p.name] as const]));
  const state = ev.protocolVersion === 1 && ev.gameStateJson ? JSON.parse(ev.gameStateJson) as GameState : null;
  const statsOf = (userId: number): CeremonyStats | null => {
    if (!state?.games.length) return null;
    const s = summarizePlayerProtocol(state, userId);
    return s.games ? { goals: s.goals, assists: s.assistsTracked ? s.assists : null, games: s.games, wins: s.wins } : null;
  };
  return AWARDS.flatMap(award => {
    const prize = result[award];
    return (prize?.winners ?? []).map(userId => ({ award, userId, name: names.get(userId) ?? 'Игрок', votes: prize!.votes,
      stats: statsOf(userId), sharedWith: prize!.winners.filter(id => id !== userId) }));
  });
}

/** One ceremony per match with every prize players voted for; written on the same read as the best-rated post. */
async function publishAwards(d: Deps, communityIds: number[]): Promise<void> {
  const closed = await awardsToPublish(d, communityIds);
  if (!closed.length) return;
  const results = await awardsByEvent(d.db, closed.map(c => c.eventId));
  for (const { eventId, closesAt } of closed) {
    const ev = await event(d.db, eventId);
    const result = results.get(eventId);
    if (!ev || !result) continue;
    const winners = await ceremonyWinners(d, eventId, result);
    const draft = composeCeremonyPost({ eventId, date: ev.date, winners, recent: await recentVariants(d.db, ev.communityId, eventId) });
    if (draft) await d.db.insert(feedPosts).values(row(ev, draft, winners.some(w => w.award === 'mvp') ? AWARDS_WITH_MVP : AWARDS_ONLY, closesAt)).onConflictDoNothing();
  }
}

/**
 * Voting closes by the clock, not by a request, so the best-rated post is written when somebody next reads
 * the feed. Only published aggregates (enough votes) are used; who voted how never leaves the database.
 */
export async function publishClosedVotes(d: Deps, communityIds: number[]): Promise<void> {
  if (!communityIds.length) return;
  // On its own guard: a failure in the awards post must not cost the group its best-rated post.
  await feedSafely(() => publishAwards(d, communityIds));
  const rows = await d.db.all<{ eventId: number; closesAt: number; userId: number; name: string; score: number }>(sql`
    SELECT e.id AS eventId, r.closes_at AS closesAt, v.recipient_id AS userId, p.name AS name, round(avg(v.score), 1) AS score
    FROM match_reviews r JOIN events e ON e.id = r.event_id
    JOIN player_votes v ON v.event_id = r.event_id
    JOIN match_participants p ON p.event_id = v.event_id AND p.user_id = v.recipient_id
    WHERE e.community_id IN (${sql.join(communityIds.map(id => sql`${id}`), sql`, `)}) AND e.status <> 'cancelled'
      AND r.closes_at <= ${d.now} AND r.closes_at > ${d.now - VOTES_WINDOW_MS}
      AND NOT EXISTS (SELECT 1 FROM feed_posts f WHERE f.event_id = e.id
        AND (f.kind = 'top_rated' OR (f.kind IN ('awards', 'ceremony') AND f.position = ${AWARDS_WITH_MVP})))
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

/**
 * Matches finished before the feed existed, or whose stories failed to save at the final whistle, get
 * them on the next read: oldest first, so milestones and phrasing follow the real order of the matches.
 */
export async function backfillMatchFeed(d: Deps, communityIds: number[]): Promise<number> {
  if (!communityIds.length) return 0;
  const missing = await d.db.all<{ id: number }>(sql`
    SELECT e.id AS id FROM events e
    WHERE e.community_id IN (${sql.join(communityIds.map(id => sql`${id}`), sql`, `)})
      AND e.protocol_version = 1 AND e.completed_at IS NOT NULL AND e.status <> 'cancelled'
      AND e.game_state_json IS NOT NULL AND json_array_length(e.game_state_json, '$.games') > 0
      AND NOT EXISTS (SELECT 1 FROM feed_posts f WHERE f.event_id = e.id
        AND f.kind IN (${sql.join(FEED_MATCH_KINDS.map(kind => sql`${kind}`), sql`, `)}))
    ORDER BY e.date, e.id LIMIT 20`);
  for (const row of missing) await publishMatchFeed(d, row.id);
  return missing.length;
}

const noReactions = (): FeedReactionsDto => ({ reactions: { fire: 0, good: 0, bad: 0 }, myReaction: null });

/** Counts per post and the viewer's own choice; keyed by match and slot like the reactions themselves. */
async function reactionsOf(db: Db, eventIds: number[], viewerId: number): Promise<Map<string, FeedReactionsDto>> {
  const out = new Map<string, FeedReactionsDto>();
  if (!eventIds.length) return out;
  const rows = await db.select({ eventId: feedReactions.eventId, slot: feedReactions.slot, reaction: feedReactions.reaction,
    count: sql<number>`count(*)`, mine: sql<number>`sum(${feedReactions.userId} = ${viewerId})` })
    .from(feedReactions).where(inArray(feedReactions.eventId, eventIds))
    .groupBy(feedReactions.eventId, feedReactions.slot, feedReactions.reaction);
  for (const r of rows) {
    if (!FEED_REACTIONS.includes(r.reaction)) continue;
    const key = `${r.eventId}:${r.slot}`;
    const entry = out.get(key) ?? noReactions();
    entry.reactions[r.reaction] = Number(r.count);
    if (Number(r.mine) > 0) entry.myReaction = r.reaction;
    out.set(key, entry);
  }
  return out;
}

/** Set, change or (with null) remove the person's reaction; a post of a foreign group does not exist. */
export async function setFeedReaction(d: Deps, postId: number, userId: number, communityIds: number[], reaction: FeedReaction | null): Promise<FeedReactionsDto | null> {
  if (!communityIds.length) return null;
  const [post] = await d.db.select({ eventId: feedPosts.eventId, slot: feedPosts.slot }).from(feedPosts)
    .where(and(eq(feedPosts.id, postId), inArray(feedPosts.communityId, communityIds)));
  if (!post) return null;
  if (reaction === null) await d.db.delete(feedReactions).where(and(eq(feedReactions.eventId, post.eventId), eq(feedReactions.slot, post.slot), eq(feedReactions.userId, userId)));
  else await d.db.insert(feedReactions).values({ eventId: post.eventId, slot: post.slot, userId, reaction, createdAt: d.now })
    .onConflictDoUpdate({ target: [feedReactions.eventId, feedReactions.slot, feedReactions.userId], set: { reaction, createdAt: d.now } });
  return (await reactionsOf(d.db, [post.eventId], userId)).get(`${post.eventId}:${post.slot}`) ?? noReactions();
}

/**
 * A group admin takes a post out of the feed for everybody. The mark is kept by match and slot, so the post
 * stays gone when the match is rewritten after a corrected result.
 */
export async function hideFeedPost(d: Deps, postId: number, userId: number, memberOf: number[], adminOf: number[]): Promise<'ok' | 'not_found' | 'forbidden'> {
  if (!memberOf.length) return 'not_found';
  const [post] = await d.db.select({ eventId: feedPosts.eventId, slot: feedPosts.slot, communityId: feedPosts.communityId }).from(feedPosts)
    .where(and(eq(feedPosts.id, postId), inArray(feedPosts.communityId, memberOf)));
  if (!post) return 'not_found';
  if (!adminOf.includes(post.communityId)) return 'forbidden';
  await d.db.insert(feedHidden).values({ eventId: post.eventId, slot: post.slot, hiddenBy: userId, createdAt: d.now }).onConflictDoNothing();
  return 'ok';
}

/** D1 allows 100 bound parameters per query; ceremony cards can name more people than that. */
const PEOPLE_CHUNK = 90;
async function peopleByIds(db: Db, ids: number[]): Promise<{ id: number; name: string; photoUrl: string | null }[]> {
  const out: { id: number; name: string; photoUrl: string | null }[] = [];
  for (let i = 0; i < ids.length; i += PEOPLE_CHUNK) {
    out.push(...await db.select({ id: users.id, name: users.displayName, photoUrl: users.photoUrl }).from(users).where(inArray(users.id, ids.slice(i, i + PEOPLE_CHUNK))));
  }
  return out;
}

/** Latest posts of all the person's groups, newest first; inside one match the winner leads. */
export async function listFeed(d: Deps, communities: readonly CommunityDto[], viewerId: number): Promise<FeedDto> {
  if (!communities.length) return { posts: [] };
  const ids = communities.map(c => c.id);
  await feedSafely(() => backfillMatchFeed(d, ids));
  await feedSafely(() => publishClosedVotes(d, ids));
  const titles = new Map(communities.map(c => [c.id, c.title]));
  const rows = await d.db.select({ post: feedPosts, date: events.date }).from(feedPosts)
    .innerJoin(events, eq(events.id, feedPosts.eventId))
    .where(and(inArray(feedPosts.communityId, ids), ne(events.status, 'cancelled'),
      sql`NOT EXISTS (SELECT 1 FROM feed_hidden h WHERE h.event_id = ${feedPosts.eventId} AND h.slot = ${feedPosts.slot})`))
    .orderBy(sql`${feedPosts.createdAt} DESC, ${feedPosts.eventId} DESC, ${feedPosts.position}, ${feedPosts.id}`).limit(FEED_PAGE);
  const cards = new Map(rows.flatMap(r => r.post.payloadJson ? [[r.post.id, JSON.parse(r.post.payloadJson) as CeremonyCard[]] as const] : []));
  // Ceremonies written before 2026-11-24 stored their MVP as the author; every ceremony is the match's post.
  const authorOf = (post: typeof feedPosts.$inferSelect) => post.kind === 'ceremony' ? null : post.userId;
  const playerIds = [...new Set([...rows.flatMap(r => { const id = authorOf(r.post); return id === null ? [] : [id]; }), ...[...cards.values()].flat().map(c => c.userId)])];
  const [reactions, people] = await Promise.all([
    reactionsOf(d.db, [...new Set(rows.map(r => r.post.eventId))], viewerId),
    peopleByIds(d.db, playerIds),
  ]);
  const players = new Map(people.map(p => [p.id, p]));
  return { posts: rows.map(({ post, date }) => {
    const author = authorOf(post);
    const player = author === null ? undefined : players.get(author);
    return {
      id: post.id, kind: post.kind, text: post.text, highlights: JSON.parse(post.highlightsJson) as string[],
      createdAt: post.createdAt, eventId: post.eventId, eventDate: date,
      community: { id: post.communityId, title: titles.get(post.communityId) ?? '' },
      userId: author, teamColor: post.teamColor,
      player: player ? { userId: player.id, name: player.name, photoUrl: player.photoUrl } : null,
      ...(cards.has(post.id) ? { ceremony: cards.get(post.id)!.map((card): CeremonyCardDto => {
        const person = players.get(card.userId);
        return { ...card, name: person?.name ?? 'Игрок', photoUrl: person?.photoUrl ?? null };
      }) } : {}),
      ...(reactions.get(`${post.eventId}:${post.slot}`) ?? noReactions()),
    };
  }) };
}
