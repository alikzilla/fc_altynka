import { calculatePlayerRating } from '@altynka/core';
import { eq } from 'drizzle-orm';
import { communities, events, memberships, signups, skillAssessments } from '../../src/db/schema';
import { playerProfile, playerRatings } from '../../src/domain/ratings';
import { env } from 'cloudflare:test';
import { db, seedUser } from '../helpers';

const NOW = Date.UTC(2026, 10, 6, 12);

async function group(tgChatId: number, title: string) {
  const [c] = await db().insert(communities).values({ tgChatId, title }).returning();
  return c;
}

/** A closed-review match in a group where every voter scored the target. */
async function ratedMatch(communityId: number, date: string, target: number, voters: number[], score: number, completedAt: number) {
  const [ev] = await db().insert(events).values({ communityId, date, place: `Поле ${date}`, createdBy: target, createdAt: 1, status: 'closed', ratingEnabled: true }).returning();
  const ids = [target, ...voters];
  const rows = await db().insert(signups).values(ids.map((userId, i) => ({ eventId: ev.id, userId, seq: i + 1, createdAt: 1 }))).returning();
  const roster = rows.map(s => ({ signupId: s.id, userId: s.userId, name: `U${s.userId}` }));
  await env.DB.prepare('INSERT INTO match_reviews(event_id, completed_at, completed_by, closes_at, roster_json) VALUES (?, ?, ?, ?, ?)')
    .bind(ev.id, completedAt, target, completedAt + 1000, JSON.stringify(roster)).run();
  for (const v of voters) {
    await env.DB.prepare('INSERT INTO review_submissions(event_id, user_id, payload_json, skipped, game_score, created_at) VALUES (?, ?, ?, 0, NULL, ?)')
      .bind(ev.id, v, JSON.stringify({ scores: [{ userId: target, score }], gameScore: null, skipped: false }), completedAt).run();
  }
  return ev.id;
}

async function world() {
  const a = await group(-1, 'A');
  const b = await group(-2, 'B');
  const u1 = await seedUser('U1', { communityId: a.id, level: 4 });
  await db().insert(memberships).values({ communityId: b.id, userId: u1.id, level: 7, checkedAt: 1 });
  const u2 = await seedUser('U2', { communityId: a.id });
  const u4 = await seedUser('U4', {});
  const voters = await Promise.all([1, 2, 3].map(i => seedUser(`V${i}`, { communityId: a.id })));
  const vIds = voters.map(v => v.id);
  const evA = await ratedMatch(a.id, '2026-11-01', u1.id, vIds, 9, NOW - 5000);
  const evB = await ratedMatch(b.id, '2026-11-02', u1.id, vIds, 5, NOW - 4000);
  return { a, b, u1, u2, u4, evA, evB };
}

test('rating counts matches from every group', async () => {
  const w = await world();
  const r = (await playerRatings(db(), [w.u1.id], NOW)).get(w.u1.id)!;
  expect(r.rating.matchesCount).toBe(2);
  expect(r.rating.initial).toBe(6);
  expect(r.rating.value).toBe(calculatePlayerRating(6, [
    { eventId: w.evA, completedAt: NOW - 5000, score: 9, votes: 3 },
    { eventId: w.evB, completedAt: NOW - 4000, score: 5, votes: 3 },
  ]));
});

test('leaving a group keeps rating and own history', async () => {
  const w = await world();
  // A self-assessment pins the starting level, so only the matches could change the value.
  await db().insert(skillAssessments).values({ userId: w.u1.id, teamwork: 6, dribbling: 6, technique: 6, shooting: 6, stamina: 6, physical: 6, passing: 6, defending: 6, createdAt: 1 });
  const before = (await playerRatings(db(), [w.u1.id], NOW)).get(w.u1.id)!.rating.value;
  await db().update(memberships).set({ active: false }).where(eq(memberships.communityId, w.b.id));
  const after = (await playerRatings(db(), [w.u1.id], NOW)).get(w.u1.id)!;
  expect(after.rating.value).toBe(before);
  expect(after.rating.matchesCount).toBe(2);
  const profile = await playerProfile(db(), w.u1.id, w.u1.id, NOW);
  expect(profile!.history.map(h => h.eventId).sort()).toEqual([w.evA, w.evB].sort());
  expect(profile!.history.find(h => h.eventId === w.evB)!.community).toEqual({ id: w.b.id, title: 'B' });
});

test('foreign profile history is limited to shared groups', async () => {
  const w = await world();
  const profile = await playerProfile(db(), w.u1.id, w.u2.id, NOW);
  expect(profile!.history.map(h => h.eventId)).toEqual([w.evA]);
  expect(await playerProfile(db(), w.u1.id, w.u4.id, NOW)).toBeNull();
});

test('initial level averages active memberships', async () => {
  const a = await group(-1, 'A');
  const b = await group(-2, 'B');
  const u = await seedUser('U', { communityId: a.id, level: 4 });
  await db().insert(memberships).values({ communityId: b.id, userId: u.id, level: 7, checkedAt: 1 });
  const r = (await playerRatings(db(), [u.id], NOW)).get(u.id)!;
  expect(r.rating.initial).toBe(6);
  const lone = await seedUser('Lone');
  expect((await playerRatings(db(), [lone.id], NOW)).get(lone.id)!.rating.initial).toBe(5);
});
