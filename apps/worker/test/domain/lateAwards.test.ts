import type { ReviewInput } from '@altynka/core';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { events, matchReviews, reviewSubmissions, signups } from '../../src/db/schema';
import { matchReview, submitReview, submitReviewAwards } from '../../src/domain/ratings';
import { FakeSync } from '../fakes/fakeSync';
import { db, seedCommunity, seedUser } from '../helpers';
import { HOUR, NOW, reviewedMatch } from './awardsFixture';

const deps = (now = NOW) => ({ db: db(), now, sync: new FakeSync() });
const rate = (userId: number, extra: Partial<ReviewInput> = {}): ReviewInput => ({ scores: [{ userId, score: 8 }], gameScore: null, skipped: false, ...extra });
const awardRows = async (authorId: number) => (await env.DB.prepare('SELECT award, recipient_id AS r FROM award_votes WHERE author_id = ? ORDER BY award').bind(authorId).all()).results;
const closesAt = async (eventId: number) => (await db().select().from(matchReviews).where(eq(matchReviews.eventId, eventId)))[0].closesAt;

async function trio() {
  const c = await seedCommunity();
  const [a, b, d] = await Promise.all(['Первый', 'Второй', 'Третий'].map(n => seedUser(n, { communityId: c.id })));
  const ev = await reviewedMatch(c.id, [a.id, b.id, d.id], { names: { [a.id]: 'Первый', [b.id]: 'Второй', [d.id]: 'Третий' } });
  return { c, a, b, d, ev };
}

describe('late award picks', () => {
  it('a submission without awards can add them once while the poll is open', async () => {
    const w = await trio();
    await submitReview(deps(), w.ev, w.a.id, rate(w.b.id));
    expect((await matchReview(db(), w.ev, w.a.id, false, NOW)).canAddAwards).toBe(true);
    expect(await submitReviewAwards(deps(), w.ev, w.a.id, { awards: { mvp: w.b.id, goalkeeper: w.d.id } })).toBe('ok');
    expect(await awardRows(w.a.id)).toEqual([{ award: 'goalkeeper', r: w.d.id }, { award: 'mvp', r: w.b.id }]);
    const view = await matchReview(db(), w.ev, w.a.id, false, NOW);
    expect(view.canAddAwards).toBe(false);
    expect(view.ownSubmission).toEqual({ scores: [{ userId: w.b.id, score: 8 }], gameScore: null, skipped: false, awards: { mvp: w.b.id, goalkeeper: w.d.id } });
    expect(await submitReviewAwards(deps(), w.ev, w.a.id, { awards: { goalkeeper: w.d.id, mvp: w.b.id } })).toBe('ok');
    expect(await submitReviewAwards(deps(), w.ev, w.a.id, { awards: { mvp: w.d.id } })).toBe('conflict');
    expect(await submitReviewAwards(deps(), w.ev, w.a.id, { skipped: true })).toBe('conflict');
    expect(await awardRows(w.a.id)).toHaveLength(2);
  });
  it('skipping the late awards is stored and hides the offer', async () => {
    const w = await trio();
    await submitReview(deps(), w.ev, w.a.id, rate(w.b.id));
    expect(await submitReviewAwards(deps(), w.ev, w.a.id, { skipped: true })).toBe('ok');
    const view = await matchReview(db(), w.ev, w.a.id, false, NOW);
    expect(view.canAddAwards).toBe(false);
    expect(view.ownSubmission?.awardsSkipped).toBe(true);
    expect(await awardRows(w.a.id)).toEqual([]);
  });
  it('rejects a self pick, a non-participant, an empty request, a missing or skipped submission and a closed poll', async () => {
    const w = await trio();
    expect(await submitReviewAwards(deps(), w.ev, w.a.id, { awards: { mvp: w.b.id } })).toBe('conflict');
    await submitReview(deps(), w.ev, w.a.id, rate(w.b.id));
    expect(await submitReviewAwards(deps(), w.ev, w.a.id, { awards: { mvp: w.a.id } })).toBe('invalid');
    expect(await submitReviewAwards(deps(), w.ev, w.a.id, { awards: { mvp: 999 } })).toBe('invalid');
    expect(await submitReviewAwards(deps(), w.ev, w.a.id, {})).toBe('invalid');
    await submitReview(deps(), w.ev, w.b.id, { scores: [], gameScore: null, skipped: true });
    expect((await matchReview(db(), w.ev, w.b.id, false, NOW)).canAddAwards).toBe(false);
    expect(await submitReviewAwards(deps(), w.ev, w.b.id, { awards: { mvp: w.a.id } })).toBe('conflict');
    expect(await submitReviewAwards(deps(NOW + HOUR), w.ev, w.a.id, { awards: { mvp: w.b.id } })).toBe('closed');
    expect((await matchReview(db(), w.ev, w.a.id, false, NOW + HOUR)).canAddAwards).toBe(false);
    expect(await awardRows(w.a.id)).toEqual([]);
  });
  it('a full poll that skipped every award is stored as awardsSkipped and offers nothing later', async () => {
    const w = await trio();
    await submitReview(deps(), w.ev, w.a.id, rate(w.b.id, { awardsSkipped: true }));
    const [row] = await db().select().from(reviewSubmissions);
    expect(JSON.parse(row.payloadJson)).toEqual({ scores: [{ userId: w.b.id, score: 8 }], gameScore: null, skipped: false, awardsSkipped: true });
    expect((await matchReview(db(), w.ev, w.a.id, false, NOW)).canAddAwards).toBe(false);
  });
});

describe('closing when everyone answered waits for the award step', () => {
  it('stays open while someone has not passed the award step, closes after their late awards', async () => {
    const w = await trio();
    await submitReview(deps(), w.ev, w.a.id, rate(w.b.id));
    await submitReview(deps(), w.ev, w.b.id, rate(w.a.id, { awards: { mvp: w.a.id } }));
    await submitReview(deps(), w.ev, w.d.id, { scores: [], gameScore: null, skipped: true });
    expect(await closesAt(w.ev.id)).toBe(NOW + HOUR);
    const org = await matchReview(db(), w.ev, w.a.id, true, NOW);
    expect(org.participants.map(p => [p.userId, p.voted, p.awardsPending ?? false])).toEqual(expect.arrayContaining([[w.a.id, true, true], [w.b.id, true, false], [w.d.id, true, false]]));
    expect(await submitReviewAwards(deps(NOW + 1000), w.ev, w.a.id, { awards: { forward: w.b.id } })).toBe('ok');
    expect(await closesAt(w.ev.id)).toBe(NOW + 1000);
  });
});

describe('player statistics in the poll', () => {
  it('participants carry goals, assists and results from the recorded games', async () => {
    const w = await trio();
    const rows = await db().select().from(signups).where(eq(signups.eventId, w.ev.id));
    const sid = (userId: number) => rows.find(r => r.userId === userId)!.id;
    const game = (id: string, sequence: number, score: [number, number], scorers: { signupId: number; goals: number }[], assists: { scorerSignupId: number; assistSignupId: number; goals: number }[]) =>
      ({ id, sequence, pair: [0, 1], score, scorers, assists, firstRestTeamIndex: null, recordedAt: 1, recordedBy: w.a.id, updatedAt: 1, updatedBy: w.a.id });
    const state = { teamCount: 2, initialPair: [0, 1], currentPair: [0, 1], receipts: [], finishParticipants: null,
      roster: [{ signupId: sid(w.a.id), userId: w.a.id, name: 'Первый', teamIndex: 0 }, { signupId: sid(w.b.id), userId: w.b.id, name: 'Второй', teamIndex: 0 }, { signupId: sid(w.d.id), userId: w.d.id, name: 'Третий', teamIndex: 1 }],
      games: [
        game('g1', 1, [2, 1], [{ signupId: sid(w.a.id), goals: 2 }, { signupId: sid(w.d.id), goals: 1 }], [{ scorerSignupId: sid(w.a.id), assistSignupId: sid(w.b.id), goals: 1 }]),
        game('g2', 2, [0, 0], [], []),
      ] };
    await db().update(events).set({ protocolVersion: 1, gameStateJson: JSON.stringify(state) }).where(eq(events.id, w.ev.id));
    const ev = (await db().select().from(events).where(eq(events.id, w.ev.id)))[0];
    const view = await matchReview(db(), ev, w.a.id, false, NOW);
    const stats = Object.fromEntries(view.participants.map(p => [p.userId, p.stats]));
    expect(stats[w.a.id]).toEqual({ games: 2, goals: 2, assists: 0, wins: 1, draws: 1, losses: 0, assistsTracked: true });
    expect(stats[w.b.id]).toMatchObject({ goals: 0, assists: 1 });
    expect(stats[w.d.id]).toMatchObject({ goals: 1, wins: 0, losses: 1, draws: 1 });
  });
  it('a match without recorded games has no statistics', async () => {
    const w = await trio();
    const view = await matchReview(db(), w.ev, w.a.id, false, NOW);
    expect(view.participants.every(p => p.stats === undefined)).toBe(true);
  });
});
