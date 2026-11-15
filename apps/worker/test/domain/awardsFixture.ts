import type { ReviewInput } from '@altynka/core';
import { env } from 'cloudflare:test';
import { events, signups } from '../../src/db/schema';
import { db } from '../helpers';

export const NOW = Date.UTC(2026, 10, 15, 12);
export const HOUR = 3600_000;

/** A finished match with an open review: closes one hour after NOW unless told otherwise. */
export async function reviewedMatch(communityId: number, userIds: number[], opts: { date?: string; closesAt?: number; names?: Record<number, string> } = {}) {
  const [ev] = await db().insert(events).values({ communityId, date: opts.date ?? '2026-11-14', place: 'Поле', createdBy: userIds[0], createdAt: 1, status: 'closed', ratingEnabled: true }).returning();
  const rows = await db().insert(signups).values(userIds.map((userId, i) => ({ eventId: ev.id, userId, seq: i + 1, createdAt: 1 }))).returning();
  const roster = rows.map(s => ({ signupId: s.id, userId: s.userId, name: opts.names?.[s.userId!] ?? `U${s.userId}` }));
  const closesAt = opts.closesAt ?? NOW + HOUR;
  await env.DB.prepare('INSERT INTO match_reviews(event_id, completed_at, completed_by, closes_at, roster_json) VALUES (?, ?, ?, ?, ?)')
    .bind(ev.id, closesAt - 72 * HOUR, userIds[0], closesAt, JSON.stringify(roster)).run();
  return ev;
}

/** Writes the submission row directly, as the domain does; the database triggers fan it out. */
export async function insertSubmission(eventId: number, userId: number, payload: Omit<ReviewInput, 'awards'> & { awards?: Record<string, number> }) {
  await env.DB.prepare('INSERT INTO review_submissions(event_id, user_id, payload_json, skipped, game_score, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(eventId, userId, JSON.stringify(payload), payload.skipped ? 1 : 0, payload.gameScore, NOW).run();
}

/** One voter rates `scores` and picks `awards`. */
export const vote = (eventId: number, userId: number, scores: Record<number, number>, awards?: Record<string, number>) =>
  insertSubmission(eventId, userId, { scores: Object.entries(scores).map(([id, score]) => ({ userId: Number(id), score })), gameScore: null, skipped: false, ...(awards ? { awards } : {}) });
