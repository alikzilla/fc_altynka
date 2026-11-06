import {
  calculatePlayerRating, matchStartsAt, MIN_REVIEW_VOTES, REVIEW_WINDOW_MS,
  selfAssessmentRating, SKILLS, type MatchReviewDto, type PlayerProfileDto,
  type PlayerSummaryDto, type RatedMatch, type ReviewInput, type SkillAnswers,
} from '@altynka/core';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, memberships, matchParticipants, matchReviews, reviewSubmissions, signups, skillAssessments, users, type EventRow } from '../db/schema';
import type { Deps } from './events';

export async function playerRatings(db: Db, communityId: number, now: number): Promise<Map<number, PlayerSummaryDto>> {
  const [members, assessments, games] = await Promise.all([
    db.select({ membership: memberships, user: users }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.communityId, communityId)),
    db.select().from(skillAssessments).where(eq(skillAssessments.communityId, communityId)),
    db.all<RatedMatch & { userId: number }>(sql`
      WITH scores AS (
        SELECT v.recipient_id AS userId, v.event_id AS eventId, r.completed_at AS completedAt,
          avg(v.score) AS score, count(*) AS votes
        FROM player_votes v JOIN match_reviews r ON r.event_id = v.event_id
        JOIN events e ON e.id = v.event_id
        WHERE e.community_id = ${communityId} AND e.status <> 'cancelled' AND r.closes_at <= ${now}
        GROUP BY v.recipient_id, v.event_id HAVING count(*) >= ${MIN_REVIEW_VOTES}
      ), ranked AS (
        SELECT *, row_number() OVER (PARTITION BY userId ORDER BY completedAt DESC, eventId DESC) AS rn FROM scores
      ) SELECT userId, eventId, completedAt, score, votes FROM ranked WHERE rn <= 10`),
  ]);
  const skillMap = new Map(assessments.map(a => [a.userId, Object.fromEntries(SKILLS.map(s => [s.key, a[s.key]])) as SkillAnswers]));
  const gameMap = new Map<number, RatedMatch[]>();
  for (const game of games) {
    const list = gameMap.get(game.userId) ?? [];
    list.push(game); gameMap.set(game.userId, list);
  }
  return new Map(members.map(({ membership, user }) => {
    const selfAssessment = skillMap.get(user.id) ?? null;
    const initial = selfAssessment ? selfAssessmentRating(selfAssessment) : membership.level;
    const matches = gameMap.get(user.id) ?? [];
    return [user.id, { userId: user.id, displayName: user.displayName, playingPosition: user.playingPosition,
      dominantFoot: user.dominantFoot, rating: { value: calculatePlayerRating(initial, matches), initial, selfAssessment, matchesCount: matches.length } }];
  }));
}

export async function playerProfile(db: Db, communityId: number, userId: number, now: number): Promise<PlayerProfileDto | null> {
  const player = (await playerRatings(db, communityId, now)).get(userId);
  if (!player) return null;
  const history = await db.all<PlayerProfileDto['history'][number]>(sql`
    SELECT e.id AS eventId, e.date, e.place,
      CASE WHEN count(v.score) >= ${MIN_REVIEW_VOTES} THEN round(avg(v.score), 1) ELSE NULL END AS score
    FROM match_participants p JOIN match_reviews r ON r.event_id = p.event_id
    JOIN events e ON e.id = p.event_id
    LEFT JOIN player_votes v ON v.event_id = p.event_id AND v.recipient_id = p.user_id
    WHERE p.user_id = ${userId} AND e.community_id = ${communityId}
      AND e.status <> 'cancelled' AND r.closes_at <= ${now}
    GROUP BY e.id ORDER BY r.completed_at DESC, e.id DESC LIMIT 20`);
  return { ...player, history };
}

export function canFinishMatch(ev: EventRow, now: number): boolean {
  const startsAt = matchStartsAt(ev);
  return ev.ratingEnabled && ev.status !== 'cancelled' && ev.status !== 'collecting' && startsAt !== null && now >= startsAt;
}

export async function finishMatch(d: Deps, ev: EventRow, organizerId: number, participantSignupIds: number[]): Promise<'ok' | 'invalid' | 'closed' | 'conflict'> {
  const [existing] = await d.db.select().from(matchReviews).where(eq(matchReviews.eventId, ev.id));
  const ids = [...participantSignupIds].sort((a, b) => a - b);
  const sameRoster = (json: string) => JSON.stringify((JSON.parse(json) as { signupId: number }[]).map(p => p.signupId).sort((a, b) => a - b)) === JSON.stringify(ids);
  if (existing) return sameRoster(existing.rosterJson) ? 'ok' : 'conflict';
  if (!canFinishMatch(ev, d.now)) return 'closed';
  if (!ids.length || new Set(ids).size !== ids.length) return 'invalid';
  const rows = await d.db.select({ signup: signups, name: users.displayName }).from(signups)
    .leftJoin(users, eq(users.id, signups.userId))
    .where(and(eq(signups.eventId, ev.id), isNull(signups.leftAt), inArray(signups.id, ids)));
  if (rows.length !== ids.length) return 'invalid';
  const roster = rows.map(({ signup: s, name }) => ({ signupId: s.id, userId: s.userId, name: name ?? s.guestName ?? 'Гость' })).sort((a, b) => a.signupId - b.signupId);
  // The roster trigger runs within this INSERT, so a retry cannot partially overwrite participants.
  await d.db.run(sql`INSERT INTO match_reviews(event_id, completed_at, completed_by, closes_at, roster_json)
    SELECT id, ${d.now}, ${organizerId}, ${d.now + REVIEW_WINDOW_MS}, ${JSON.stringify(roster)}
    FROM events WHERE id = ${ev.id} AND community_id = ${ev.communityId} AND rating_enabled = 1 AND status <> 'cancelled'
    ON CONFLICT(event_id) DO NOTHING`);
  const [saved] = await d.db.select().from(matchReviews).where(eq(matchReviews.eventId, ev.id));
  return saved ? sameRoster(saved.rosterJson) ? 'ok' : 'conflict' : 'closed';
}

export async function matchReview(db: Db, ev: EventRow, userId: number, manage: boolean, now: number): Promise<MatchReviewDto> {
  const [review] = await db.select().from(matchReviews).where(eq(matchReviews.eventId, ev.id));
  const empty: MatchReviewDto = { state: ev.ratingEnabled ? 'pending' : 'legacy', canFinish: manage && canFinishMatch(ev, now), completedAt: null, closesAt: null, gameScore: null, serverNow: now, participants: [], ownSubmission: null };
  if (!review || ev.status === 'cancelled') return { ...empty, canFinish: ev.status !== 'cancelled' && empty.canFinish };
  const [participants, submissions, scores, overall] = await Promise.all([
    db.select().from(matchParticipants).where(eq(matchParticipants.eventId, ev.id)),
    db.select().from(reviewSubmissions).where(and(eq(reviewSubmissions.eventId, ev.id), eq(reviewSubmissions.userId, userId))),
    now >= review.closesAt ? db.all<{ userId: number; score: number | null }>(sql`
      SELECT recipient_id AS userId, CASE WHEN count(*) >= ${MIN_REVIEW_VOTES} THEN round(avg(score), 1) ELSE NULL END AS score
      FROM player_votes WHERE event_id = ${ev.id} GROUP BY recipient_id`) : Promise.resolve([]),
    now >= review.closesAt ? db.all<{ score: number | null }>(sql`
      SELECT CASE WHEN count(game_score) >= ${MIN_REVIEW_VOTES} THEN round(avg(game_score), 1) ELSE NULL END AS score
      FROM review_submissions WHERE event_id = ${ev.id}`) : Promise.resolve([]),
  ]);
  const own = submissions[0];
  const eligible = participants.some(p => p.userId === userId);
  const scoreMap = new Map(scores.map(s => [s.userId, s.score]));
  return { state: now >= review.closesAt ? 'closed' : !eligible ? 'ineligible' : own ? own.skipped ? 'skipped' : 'submitted' : 'open',
    canFinish: false, completedAt: review.completedAt, closesAt: review.closesAt, serverNow: now,
    gameScore: overall[0]?.score ?? null,
    participants: participants.flatMap(p => p.userId === null ? [] : [{ userId: p.userId, name: p.name, score: scoreMap.get(p.userId) ?? null }]),
    ownSubmission: own ? JSON.parse(own.payloadJson) as ReviewInput : null };
}

export async function submitReview(d: Deps, ev: EventRow, userId: number, input: ReviewInput): Promise<'ok' | 'invalid' | 'closed' | 'conflict' | 'forbidden'> {
  const normalized: ReviewInput = { scores: [...input.scores].sort((a, b) => a.userId - b.userId), gameScore: input.gameScore, skipped: input.skipped };
  const payload = JSON.stringify(normalized);
  const [existing] = await d.db.select().from(reviewSubmissions).where(and(eq(reviewSubmissions.eventId, ev.id), eq(reviewSubmissions.userId, userId)));
  if (existing) return existing.payloadJson === payload ? 'ok' : 'conflict';
  const [review] = await d.db.select().from(matchReviews).where(eq(matchReviews.eventId, ev.id));
  if (!review || ev.status === 'cancelled' || d.now >= review.closesAt) return 'closed';
  const participants = await d.db.select().from(matchParticipants).where(eq(matchParticipants.eventId, ev.id));
  const ids = new Set(participants.flatMap(p => p.userId === null ? [] : [p.userId]));
  if (!ids.has(userId)) return 'forbidden';
  if (new Set(input.scores.map(s => s.userId)).size !== input.scores.length || input.scores.some(s => s.userId === userId || !ids.has(s.userId))) return 'invalid';
  // Inserting one immutable submission also inserts its votes via trigger, atomically.
  await d.db.run(sql`INSERT INTO review_submissions(event_id, user_id, payload_json, skipped, game_score, created_at)
    SELECT r.event_id, ${userId}, ${payload}, ${input.skipped ? 1 : 0}, ${input.gameScore}, ${d.now}
    FROM match_reviews r JOIN events e ON e.id = r.event_id
    WHERE r.event_id = ${ev.id} AND r.closes_at > ${d.now} AND e.status <> 'cancelled'
    ON CONFLICT(event_id, user_id) DO NOTHING`);
  const [saved] = await d.db.select().from(reviewSubmissions).where(and(eq(reviewSubmissions.eventId, ev.id), eq(reviewSubmissions.userId, userId)));
  return saved ? saved.payloadJson === payload ? 'ok' : 'conflict' : 'closed';
}
