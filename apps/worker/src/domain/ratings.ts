import {
  AWARDS, calculatePlayerRating, matchStartsAt, MIN_REVIEW_VOTES, normalizeAwardPicks, REVIEW_WINDOW_MS,
  selfAssessmentRating, SKILLS, type MatchAwardsDto, type MatchReviewDto, type PlayerProfileDto,
  type PlayerSummaryDto, type RatedMatch, type ReviewInput, type SkillAnswers,
} from '@altynka/core';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, memberships, matchParticipants, matchReviews, reviewSubmissions, signups, skillAssessments, users, type EventRow, type UserRow } from '../db/schema';
import type { Deps } from './events';
import { peerUserIds } from './members';
import { getEvent } from './events';
import { parseGameState } from './gameStore';
import { usersById } from '../sync/parts';
import { playerGameStatistics } from './playerStatistics';
import { awardsByEvent } from './awards';

/** D1 allows 100 bound parameters per query; each query below binds one id list plus a few values. */
const RATING_CHUNK = 30;

async function ratingInputs(db: Db, ids: number[], now: number, knownUsers?: ReadonlyMap<number, UserRow>) {
  return Promise.all([
    usersById(db, ids, knownUsers).then(people => [...people.values()]),
    db.select({ userId: memberships.userId, avg: sql<number>`avg(${memberships.level})` }).from(memberships)
      .where(inArray(memberships.userId, ids)).groupBy(memberships.userId),
    db.select().from(skillAssessments).where(inArray(skillAssessments.userId, ids)),
    db.all<RatedMatch & { userId: number }>(sql`
      WITH scores AS (
        SELECT v.recipient_id AS userId, v.event_id AS eventId, r.completed_at AS completedAt,
          avg(v.score) AS score, count(*) AS votes
        FROM player_votes v JOIN match_reviews r ON r.event_id = v.event_id
        JOIN events e ON e.id = v.event_id
        WHERE v.recipient_id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
          AND e.status <> 'cancelled' AND r.closes_at <= ${now}
        GROUP BY v.recipient_id, v.event_id HAVING count(*) >= ${MIN_REVIEW_VOTES}
      ), ranked AS (
        SELECT *, row_number() OVER (PARTITION BY userId ORDER BY completedAt DESC, eventId DESC) AS rn FROM scores
      ) SELECT userId, eventId, completedAt, score, votes FROM ranked WHERE rn <= 10`),
  ]);
}

export async function playerRatings(db: Db, userIds: number[], now: number, knownUsers?: ReadonlyMap<number, UserRow>): Promise<Map<number, PlayerSummaryDto>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += RATING_CHUNK) chunks.push(ids.slice(i, i + RATING_CHUNK));
  const parts = await Promise.all(chunks.map(chunk => ratingInputs(db, chunk, now, knownUsers)));
  const people = parts.flatMap(p => p[0]);
  const levels = parts.flatMap(p => p[1]);
  const assessments = parts.flatMap(p => p[2]);
  const games = parts.flatMap(p => p[3]);
  const skillMap = new Map(assessments.map(a => [a.userId, Object.fromEntries(SKILLS.map(s => [s.key, a[s.key]])) as SkillAnswers]));
  const levelMap = new Map(levels.map(l => [l.userId, Math.round(Number(l.avg))]));
  const gameMap = new Map<number, RatedMatch[]>();
  for (const game of games) {
    const list = gameMap.get(game.userId) ?? [];
    list.push(game); gameMap.set(game.userId, list);
  }
  return new Map(people.map(user => {
    const selfAssessment = skillMap.get(user.id) ?? null;
    const initial = selfAssessment ? selfAssessmentRating(selfAssessment) : (levelMap.get(user.id) ?? 5);
    const matches = gameMap.get(user.id) ?? [];
    return [user.id, { userId: user.id, displayName: user.displayName, photoUrl: user.photoUrl, playingPosition: user.playingPosition,
      dominantFoot: user.dominantFoot, rating: { value: calculatePlayerRating(initial, matches), initial, selfAssessment, matchesCount: matches.length } }];
  }));
}

export async function playerProfile(db: Db, userId: number, viewerId: number, now: number): Promise<PlayerProfileDto | null> {
  if (userId !== viewerId && !(await peerUserIds(db, viewerId)).includes(userId)) return null;
  const player = (await playerRatings(db, [userId], now)).get(userId);
  if (!player) return null;
  const shared = userId === viewerId ? sql`` : sql`AND c.active = 1 AND EXISTS (
    SELECT 1 FROM memberships mine JOIN memberships theirs ON theirs.community_id=mine.community_id
    WHERE mine.community_id=e.community_id AND mine.user_id=${viewerId} AND mine.active=1
      AND theirs.user_id=${userId} AND theirs.active=1)`;
  const rows = await db.all<Omit<PlayerProfileDto['history'][number], 'community'> & { communityId: number; communityTitle: string }>(sql`
    SELECT e.id AS eventId, e.date, e.place, e.protocol_version AS protocolVersion, c.id AS communityId, c.title AS communityTitle,
      CASE WHEN count(v.score) >= ${MIN_REVIEW_VOTES} THEN round(avg(v.score), 1) ELSE NULL END AS score
    FROM match_participants p JOIN match_reviews r ON r.event_id = p.event_id
    JOIN events e ON e.id = p.event_id JOIN communities c ON c.id = e.community_id
    LEFT JOIN player_votes v ON v.event_id = p.event_id AND v.recipient_id = p.user_id
    WHERE p.user_id = ${userId} AND e.status <> 'cancelled' AND r.closes_at <= ${now} ${shared}
    GROUP BY e.id ORDER BY r.completed_at DESC, e.id DESC LIMIT 20`);
  const history = rows.map(({ communityId, communityTitle, ...h }) => ({ ...h, community: { id: communityId, title: communityTitle } }));
  const [games, details, roles] = await Promise.all([
    playerGameStatistics(db, userId, viewerId, now),
    db.select({ username: users.username, pinnedAchievement: users.pinnedAchievement }).from(users).where(eq(users.id,userId)),
    db.all<{role:'organizer'|'player';telegramAdmin:number;injured:number}>(sql`
      SELECT m.role,m.telegram_admin AS telegramAdmin,m.injured FROM memberships m JOIN communities c ON c.id=m.community_id
      WHERE m.user_id=${userId} AND m.active=1 AND c.active=1 ${userId===viewerId?sql``:sql`AND EXISTS (
        SELECT 1 FROM memberships mine WHERE mine.community_id=m.community_id AND mine.user_id=${viewerId} AND mine.active=1)`}`),
  ]);
  const role = roles.some(r=>r.telegramAdmin) ? 'admin' : roles.some(r=>r.role==='organizer') ? 'organizer' : 'player';
  return { ...player, history, ...games, telegramUsername: details[0]?.username??null, pinnedAchievement: details[0]?.pinnedAchievement??null, role, injured: roles.some(r=>r.injured) };
}

export function canFinishMatch(ev: EventRow, now: number): boolean {
  if (ev.protocolVersion === 1) return false;
  const startsAt = matchStartsAt(ev);
  return ev.ratingEnabled && ev.status !== 'cancelled' && ev.status !== 'collecting' && startsAt !== null && now >= startsAt;
}

export async function finishMatch(d: Deps, ev: EventRow, organizerId: number, participantSignupIds: number[]): Promise<'ok' | 'invalid' | 'closed' | 'conflict'> {
  if (ev.protocolVersion === 1) return 'closed';
  const [existing] = await d.db.select().from(matchReviews).where(eq(matchReviews.eventId, ev.id));
  const ids = [...participantSignupIds].sort((a, b) => a - b);
  const sameRoster = (json: string) => JSON.stringify((JSON.parse(json) as { signupId: number }[]).map(p => p.signupId).sort((a, b) => a - b)) === JSON.stringify(ids);
  if (existing) {
    if (!sameRoster(existing.rosterJson)) return 'conflict';
    await d.sync.request(ev.id, { parts: [], review: true });
    return 'ok';
  }
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
  if (!saved) return 'closed';
  if (!sameRoster(saved.rosterJson)) return 'conflict';
  await d.sync.request(ev.id, { parts: [], review: true });
  return 'ok';
}

export async function matchReview(db: Db, ev: EventRow, userId: number, manage: boolean, now: number): Promise<MatchReviewDto> {
  const [review] = await db.select().from(matchReviews).where(eq(matchReviews.eventId, ev.id));
  const empty: MatchReviewDto = { state: ev.ratingEnabled ? 'pending' : 'legacy', canFinish: manage && canFinishMatch(ev, now), completedAt: null, closesAt: null, gameScore: null, serverNow: now, participants: [], ownSubmission: null, awards: null };
  if (!review && ev.protocolVersion === 1 && ev.completedAt !== null) {
    const state = parseGameState(ev);
    return { ...empty, state: state?.finishParticipants?.length ? 'pending' : 'ineligible', canFinish: false, completedAt: ev.completedAt };
  }
  if (!review || ev.status === 'cancelled') return { ...empty, canFinish: ev.status !== 'cancelled' && empty.canFinish };
  const closed = now >= review.closesAt;
  const [participants, submissions, voters, scores, overall, results] = await Promise.all([
    db.select().from(matchParticipants).where(eq(matchParticipants.eventId, ev.id)),
    db.select().from(reviewSubmissions).where(and(eq(reviewSubmissions.eventId, ev.id), eq(reviewSubmissions.userId, userId))),
    // Организатор видит только факт ответа (оценил или пропустил), но не сами оценки.
    manage && !closed ? db.select({ userId: reviewSubmissions.userId }).from(reviewSubmissions).where(eq(reviewSubmissions.eventId, ev.id)) : Promise.resolve([]),
    now >= review.closesAt ? db.all<{ userId: number; score: number | null }>(sql`
      SELECT recipient_id AS userId, CASE WHEN count(*) >= ${MIN_REVIEW_VOTES} THEN round(avg(score), 1) ELSE NULL END AS score
      FROM player_votes WHERE event_id = ${ev.id} GROUP BY recipient_id`) : Promise.resolve([]),
    now >= review.closesAt ? db.all<{ score: number | null }>(sql`
      SELECT CASE WHEN count(game_score) >= ${MIN_REVIEW_VOTES} THEN round(avg(game_score), 1) ELSE NULL END AS score
      FROM review_submissions WHERE event_id = ${ev.id}`) : Promise.resolve([]),
    closed ? awardsByEvent(db, [ev.id]).then(map => map.get(ev.id) ?? null) : Promise.resolve(null),
  ]);
  const people = await usersById(db, participants.flatMap(p => p.userId === null ? [] : [p.userId]));
  const own = submissions[0];
  const eligible = participants.some(p => p.userId === userId);
  const scoreMap = new Map(scores.map(s => [s.userId, s.score]));
  const nameOf = new Map(participants.flatMap(p => p.userId === null ? [] : [[p.userId, p.name] as const]));
  // Nothing awarded (or a match closed before awards existed) reads as "no awards", not five empty rows.
  const awards: MatchAwardsDto | null = results && AWARDS.some(key => results[key]) ? Object.fromEntries(AWARDS.map(key => {
    const result = results[key];
    return [key, result && { votes: result.votes, winners: result.winners.map(userId => ({ userId, name: nameOf.get(userId) ?? 'Игрок', photoUrl: people.get(userId)?.photoUrl ?? null })) }];
  })) as MatchAwardsDto : null;
  const voted = new Set(voters.map(v => v.userId));
  const progress = manage && !closed;
  return { state: now >= review.closesAt ? 'closed' : !eligible ? 'ineligible' : own ? own.skipped ? 'skipped' : 'submitted' : 'open',
    canFinish: false, canClose: progress, completedAt: review.completedAt, closesAt: review.closesAt, serverNow: now,
    gameScore: overall[0]?.score ?? null,
    participants: participants.flatMap(p => p.userId === null ? [] : [{ userId: p.userId, name: p.name, photoUrl: people.get(p.userId)?.photoUrl ?? null, score: scoreMap.get(p.userId) ?? null, ...(progress ? { voted: voted.has(p.userId) } : {}) }]),
    ownSubmission: own ? JSON.parse(own.payloadJson) as ReviewInput : null, awards };
}

/** Complete the review outbox stored by finish; names come from the immutable game roster. */
export async function ensureGameReview(d: Deps, eventId: number): Promise<void> {
  const ev = await getEvent(d.db, eventId);
  if (!ev || ev.protocolVersion !== 1 || ev.completedAt === null || !ev.ratingEnabled || ev.status === 'cancelled') return;
  const state = parseGameState(ev);
  if (!state?.finishParticipants?.length || state.finishedBy === undefined) return;
  const roster = state.roster.filter(p => state.finishParticipants!.includes(p.signupId));
  await d.db.run(sql`INSERT INTO match_reviews(event_id,completed_at,completed_by,closes_at,roster_json)
    VALUES(${eventId},${ev.completedAt},${state.finishedBy},${ev.completedAt + REVIEW_WINDOW_MS},${JSON.stringify(roster)})
    ON CONFLICT(event_id) DO NOTHING`);
}

export async function submitReview(d: Deps, ev: EventRow, userId: number, input: ReviewInput): Promise<'ok' | 'invalid' | 'closed' | 'conflict' | 'forbidden'> {
  // `awards` is written only when something was picked, so a poll without awards keeps its pre-awards payload.
  const picks = normalizeAwardPicks(input.awards);
  const normalized: ReviewInput = { scores: [...input.scores].sort((a, b) => a.userId - b.userId), gameScore: input.gameScore, skipped: input.skipped, ...(picks ? { awards: picks } : {}) };
  const payload = JSON.stringify(normalized);
  const [existing] = await d.db.select().from(reviewSubmissions).where(and(eq(reviewSubmissions.eventId, ev.id), eq(reviewSubmissions.userId, userId)));
  if (existing) {
    if (existing.payloadJson !== payload) return 'conflict';
    await closeReview(d, ev.id, true);
    return 'ok';
  }
  const [review] = await d.db.select().from(matchReviews).where(eq(matchReviews.eventId, ev.id));
  if (!review || ev.status === 'cancelled' || d.now >= review.closesAt) return 'closed';
  const participants = await d.db.select().from(matchParticipants).where(eq(matchParticipants.eventId, ev.id));
  const ids = new Set(participants.flatMap(p => p.userId === null ? [] : [p.userId]));
  if (!ids.has(userId)) return 'forbidden';
  if (new Set(input.scores.map(s => s.userId)).size !== input.scores.length || input.scores.some(s => s.userId === userId || !ids.has(s.userId))) return 'invalid';
  if (Object.values(picks ?? {}).some(id => id === userId || !ids.has(id))) return 'invalid';
  // Inserting one immutable submission also inserts its votes via trigger, atomically.
  await d.db.run(sql`INSERT INTO review_submissions(event_id, user_id, payload_json, skipped, game_score, created_at)
    SELECT r.event_id, ${userId}, ${payload}, ${input.skipped ? 1 : 0}, ${input.gameScore}, ${d.now}
    FROM match_reviews r JOIN events e ON e.id = r.event_id
    WHERE r.event_id = ${ev.id} AND r.closes_at > ${d.now} AND e.status <> 'cancelled'
    ON CONFLICT(event_id, user_id) DO NOTHING`);
  const [saved] = await d.db.select().from(reviewSubmissions).where(and(eq(reviewSubmissions.eventId, ev.id), eq(reviewSubmissions.userId, userId)));
  if (!saved) return 'closed';
  if (saved.payloadJson !== payload) return 'conflict';
  await closeReview(d, ev.id, true);
  return 'ok';
}

/**
 * Досрочно закрывает опрос: срок переносится на «сейчас», и всё, что ждёт `closes_at` (итоги, рейтинг,
 * пост в ленте, напоминания), срабатывает как при обычном окончании. `onlyComplete` — только если
 * ответили (оценили или пропустили) все участники с аккаунтом. Возвращает, закрыт ли опрос после вызова.
 */
export async function closeReview(d: Deps, eventId: number, onlyComplete = false): Promise<boolean> {
  const complete = onlyComplete ? sql`AND NOT EXISTS (
    SELECT 1 FROM match_participants p LEFT JOIN review_submissions s ON s.event_id = p.event_id AND s.user_id = p.user_id
    WHERE p.event_id = ${eventId} AND p.user_id IS NOT NULL AND s.user_id IS NULL)` : sql``;
  await d.db.run(sql`UPDATE match_reviews SET closes_at = max(${d.now}, completed_at + 1)
    WHERE event_id = ${eventId} AND closes_at > ${d.now} ${complete}`);
  const [review] = await d.db.select({ closesAt: matchReviews.closesAt }).from(matchReviews).where(eq(matchReviews.eventId, eventId));
  return !!review && review.closesAt <= d.now;
}
