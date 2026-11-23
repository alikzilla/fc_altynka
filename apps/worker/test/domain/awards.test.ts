import type { ReviewInput } from '@altynka/core';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { communities, events, memberships, reviewSubmissions } from '../../src/db/schema';
import { playerAwardCounts, reigningMvps } from '../../src/domain/awards';
import { playerGameStatistics } from '../../src/domain/playerStatistics';
import { closeReview, matchReview, submitReview } from '../../src/domain/ratings';
import { FakeSync } from '../fakes/fakeSync';
import { db, seedCommunity, seedUser } from '../helpers';
import { HOUR, NOW, reviewedMatch, vote } from './awardsFixture';

const deps = (now = NOW) => ({ db: db(), now, sync: new FakeSync() });
const rate = (userId: number, awards?: ReviewInput['awards']): ReviewInput => ({ scores: [{ userId, score: 8 }], gameScore: null, skipped: false, ...(awards ? { awards } : {}) });

async function trio() {
  const c = await seedCommunity();
  const [a, b, d] = await Promise.all(['Первый', 'Второй', 'Третий'].map(n => seedUser(n, { communityId: c.id })));
  const names = { [a.id]: 'Первый', [b.id]: 'Второй', [d.id]: 'Третий' };
  return { c, a, b, d, names };
}
const awardRows = async (authorId: number) => (await env.DB.prepare('SELECT award, recipient_id AS r FROM award_votes WHERE author_id = ? ORDER BY award').bind(authorId).all()).results;

describe('award_votes table', () => {
  it('a submission with awards writes one award_votes row per pick', async () => {
    const w = await trio();
    const ev = await reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id]);
    await vote(ev.id, w.a.id, { [w.b.id]: 8 }, { mvp: w.b.id, defender: w.d.id });
    expect(await awardRows(w.a.id)).toEqual([{ award: 'defender', r: w.d.id }, { award: 'mvp', r: w.b.id }]);
  });
  it('a submission without awards writes no award_votes rows', async () => {
    const w = await trio();
    const ev = await reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id]);
    await vote(ev.id, w.a.id, { [w.b.id]: 8 });
    expect(await awardRows(w.a.id)).toEqual([]);
  });
  it('the database rejects a self vote and an unknown award', async () => {
    const w = await trio();
    const ev = await reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id]);
    await expect(vote(ev.id, w.a.id, { [w.b.id]: 8 }, { mvp: w.a.id })).rejects.toThrow();
    await expect(vote(ev.id, w.a.id, { [w.b.id]: 8 }, { captain: w.b.id })).rejects.toThrow();
    expect(await db().$count(reviewSubmissions)).toBe(0);
  });
});

describe('award picks in the review', () => {
  it('accepts picks, rejects a self pick and a non-participant', async () => {
    const w = await trio();
    const ev = await reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id]);
    expect(await submitReview(deps(), ev, w.a.id, rate(w.b.id, { mvp: w.b.id }))).toBe('ok');
    expect(await submitReview(deps(), ev, w.b.id, rate(w.a.id, { mvp: w.b.id }))).toBe('invalid');
    expect(await submitReview(deps(), ev, w.d.id, rate(w.a.id, { forward: 999 }))).toBe('invalid');
    expect(await awardRows(w.a.id)).toEqual([{ award: 'mvp', r: w.b.id }]);
  });
  it('a retry with the same picks in another key order is ok, different picks conflict', async () => {
    const w = await trio();
    const ev = await reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id]);
    await submitReview(deps(), ev, w.a.id, rate(w.b.id, { mvp: w.b.id, goalkeeper: w.d.id }));
    expect(await submitReview(deps(), ev, w.a.id, rate(w.b.id, { goalkeeper: w.d.id, mvp: w.b.id }))).toBe('ok');
    expect(await submitReview(deps(), ev, w.a.id, rate(w.b.id, { mvp: w.d.id }))).toBe('conflict');
  });
  it('a submission without awards stores the pre-release payload string', async () => {
    const w = await trio();
    const ev = await reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id]);
    await submitReview(deps(), ev, w.a.id, { ...rate(w.b.id), awards: {} });
    const [row] = await db().select().from(reviewSubmissions);
    expect(row.payloadJson).toBe(JSON.stringify({ scores: [{ userId: w.b.id, score: 8 }], gameScore: null, skipped: false }));
  });
  it('hides awards while voting is open and shows winners with names after it closes', async () => {
    const w = await trio();
    const ev = await reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id], { names: w.names });
    await submitReview(deps(), ev, w.a.id, rate(w.b.id, { mvp: w.b.id, defender: w.d.id }));
    await submitReview(deps(), ev, w.d.id, rate(w.b.id, { mvp: w.b.id }));
    expect((await matchReview(db(), ev, w.a.id, false, NOW)).awards).toBeNull();
    const closed = await matchReview(db(), ev, w.a.id, false, NOW + HOUR);
    expect(closed.state).toBe('closed');
    expect(closed.awards?.mvp).toEqual({ winners: [{ userId: w.b.id, name: 'Второй', photoUrl: null }], votes: 2 });
    expect(closed.awards?.defender).toBeNull();
  });
  it('the tie between two players goes to the one rated higher in this match', async () => {
    const c = await seedCommunity();
    const u = await Promise.all([1, 2, 3, 4, 5].map(i => seedUser(`P${i}`, { communityId: c.id })));
    const [a, b, d, e, f] = u.map(x => x.id);
    const ev = await reviewedMatch(c.id, [a, b, d, e, f]);
    await vote(ev.id, a, { [b]: 6, [d]: 9 }, { mvp: b });
    await vote(ev.id, e, { [b]: 6 }, { mvp: b });
    await vote(ev.id, b, { [d]: 9 }, { mvp: d });
    await vote(ev.id, f, { [d]: 9 }, { mvp: d });
    const closed = await matchReview(db(), ev, a, false, NOW + HOUR);
    expect(closed.awards?.mvp?.winners.map(x => x.userId)).toEqual([d]);
  });
  it('awards is null after close when nobody picked anything', async () => {
    const w = await trio();
    const ev = await reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id]);
    await submitReview(deps(), ev, w.a.id, rate(w.b.id));
    expect((await matchReview(db(), ev, w.a.id, false, NOW + HOUR)).awards).toBeNull();
  });
});

describe('award totals of a player', () => {
  /** Match A: b is MVP and shares defender with d. Match B: b is MVP again. Both closed at NOW. */
  async function season() {
    const w = await trio();
    const e = await seedUser('Четвёртый', { communityId: w.c.id });
    const ids = [w.a.id, w.b.id, w.d.id, e.id];
    const evA = await reviewedMatch(w.c.id, ids, { date: '2026-11-07', closesAt: NOW - 2 * HOUR });
    await vote(evA.id, w.a.id, { [w.b.id]: 8 }, { mvp: w.b.id, defender: w.b.id });
    await vote(evA.id, e.id, { [w.b.id]: 8, [w.d.id]: 8 }, { mvp: w.b.id, defender: w.d.id });
    await vote(evA.id, w.b.id, { [w.d.id]: 8 }, { defender: w.d.id });
    await vote(evA.id, w.d.id, { [w.b.id]: 8 }, { defender: w.b.id, forward: w.a.id });
    const evB = await reviewedMatch(w.c.id, ids, { date: '2026-11-10', closesAt: NOW - HOUR });
    await vote(evB.id, w.a.id, { [w.b.id]: 8 }, { mvp: w.b.id });
    await vote(evB.id, w.d.id, { [w.b.id]: 8 }, { mvp: w.b.id });
    return { ...w, e, evA, evB };
  }
  it("counts a player's awards across closed matches, including a shared one", async () => {
    const w = await season();
    expect(await playerAwardCounts(db(), w.b.id, w.b.id, NOW)).toEqual({ mvp: 2, forward: 0, midfielder: 0, defender: 1, goalkeeper: 0 });
    expect(await playerAwardCounts(db(), w.d.id, w.d.id, NOW)).toEqual({ mvp: 0, forward: 0, midfielder: 0, defender: 1, goalkeeper: 0 });
    expect(await playerAwardCounts(db(), w.a.id, w.a.id, NOW)).toEqual({ mvp: 0, forward: 0, midfielder: 0, defender: 0, goalkeeper: 0 });
  });
  it('ignores a match that is still open', async () => {
    const w = await season();
    expect((await playerAwardCounts(db(), w.b.id, w.b.id, NOW - 90 * 60_000)).mvp).toBe(1);
  });
  it('ignores a cancelled match', async () => {
    const w = await season();
    await db().update(events).set({ status: 'cancelled' }).where(eq(events.id, w.evB.id));
    expect((await playerAwardCounts(db(), w.b.id, w.b.id, NOW)).mvp).toBe(1);
  });
  it('a peer sees only awards from groups shared with the player', async () => {
    const w = await season();
    const [other] = await db().insert(communities).values({ tgChatId: -777, title: 'Другая' }).returning();
    const stranger = await seedUser('Чужой', { communityId: other.id });
    const mate = await seedUser('Сосед', { communityId: other.id });
    await db().insert(memberships).values({ communityId: other.id, userId: w.b.id, checkedAt: 1 });
    const evC = await reviewedMatch(other.id, [w.b.id, stranger.id, mate.id], { closesAt: NOW - HOUR });
    await vote(evC.id, stranger.id, { [w.b.id]: 8 }, { goalkeeper: w.b.id });
    await vote(evC.id, mate.id, { [w.b.id]: 8 }, { goalkeeper: w.b.id });
    expect(await playerAwardCounts(db(), w.b.id, w.b.id, NOW)).toMatchObject({ mvp: 2, goalkeeper: 1 });
    expect(await playerAwardCounts(db(), w.b.id, w.a.id, NOW)).toMatchObject({ mvp: 2, goalkeeper: 0 });
    expect(await playerAwardCounts(db(), w.b.id, stranger.id, NOW)).toMatchObject({ mvp: 0, goalkeeper: 1 });
  });
  it('profile statistics carry award totals even without recorded games', async () => {
    const w = await season();
    expect((await playerGameStatistics(db(), w.b.id, w.b.id, NOW)).statistics).toMatchObject({ meetings: 0, mvps: 2, positionAwards: 1 });
  });
});

describe('closing a vote early', () => {
  it('wakes the match sync once, so the congratulation is not left waiting for the original deadline', async () => {
    const w = await trio();
    const ev = await reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id]);
    const d = deps();
    expect(await closeReview(d, ev.id)).toBe(true);
    expect(d.sync.calls).toEqual([{ eventId: ev.id, req: { parts: [], review: true } }]);
    expect(await closeReview(d, ev.id)).toBe(true);
    expect(d.sync.calls).toHaveLength(1);
  });
  it('an incomplete vote that stays open wakes nothing', async () => {
    const w = await trio();
    const ev = await reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id]);
    const d = deps();
    expect(await closeReview(d, ev.id, true)).toBe(false);
    expect(d.sync.calls).toEqual([]);
  });
});

describe('reigning MVP', () => {
  const closedMatch = async (w: Awaited<ReturnType<typeof trio>>, closesAt: number) =>
    reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id], { closesAt, names: w.names });
  it('the crown belongs to the MVP of the latest closed match and passes on', async () => {
    const w = await trio();
    const first = await closedMatch(w, NOW - 10 * HOUR);
    await vote(first.id, w.b.id, { [w.a.id]: 8 }, { mvp: w.a.id }); await vote(first.id, w.d.id, { [w.a.id]: 8 }, { mvp: w.a.id });
    expect((await reigningMvps(db(), [w.c.id], NOW)).get(w.c.id)).toEqual([w.a.id]);
    const second = await closedMatch(w, NOW - HOUR);
    await vote(second.id, w.a.id, { [w.b.id]: 8 }, { mvp: w.b.id }); await vote(second.id, w.d.id, { [w.b.id]: 8 }, { mvp: w.b.id });
    expect((await reigningMvps(db(), [w.c.id], NOW)).get(w.c.id)).toEqual([w.b.id]);
  });
  it('a later match without an MVP leaves the crown where it was', async () => {
    const w = await trio();
    const first = await closedMatch(w, NOW - 10 * HOUR);
    await vote(first.id, w.b.id, { [w.a.id]: 8 }, { mvp: w.a.id }); await vote(first.id, w.d.id, { [w.a.id]: 8 }, { mvp: w.a.id });
    const second = await closedMatch(w, NOW - HOUR);
    await vote(second.id, w.a.id, { [w.b.id]: 8 }, { defender: w.b.id }); await vote(second.id, w.d.id, { [w.b.id]: 8 }, { defender: w.b.id, mvp: w.a.id });
    expect((await reigningMvps(db(), [w.c.id], NOW)).get(w.c.id)).toEqual([w.a.id]);
  });
  it('an open vote and a cancelled match do not move the crown', async () => {
    const w = await trio();
    const first = await closedMatch(w, NOW - 10 * HOUR);
    await vote(first.id, w.b.id, { [w.a.id]: 8 }, { mvp: w.a.id }); await vote(first.id, w.d.id, { [w.a.id]: 8 }, { mvp: w.a.id });
    const open = await closedMatch(w, NOW + HOUR);
    await vote(open.id, w.a.id, { [w.b.id]: 8 }, { mvp: w.b.id }); await vote(open.id, w.d.id, { [w.b.id]: 8 }, { mvp: w.b.id });
    const cancelled = await closedMatch(w, NOW - HOUR);
    await vote(cancelled.id, w.a.id, { [w.d.id]: 8 }, { mvp: w.d.id }); await vote(cancelled.id, w.b.id, { [w.d.id]: 8 }, { mvp: w.d.id });
    await db().update(events).set({ status: 'cancelled' }).where(eq(events.id, cancelled.id));
    expect((await reigningMvps(db(), [w.c.id], NOW)).get(w.c.id)).toEqual([w.a.id]);
  });
  it('a shared MVP crowns both; a group without awards has no entry', async () => {
    const w = await trio();
    const [other] = await db().insert(communities).values({ tgChatId: -100777, title: 'Другая' }).returning();
    const [e, f] = await Promise.all(['Четвёртый', 'Пятый'].map(n => seedUser(n, { communityId: w.c.id })));
    const ev = await reviewedMatch(w.c.id, [w.a.id, w.b.id, w.d.id, e.id, f.id], { closesAt: NOW - HOUR });
    // По два голоса и одинаковая средняя: награду делят двое.
    await vote(ev.id, w.d.id, { [w.a.id]: 8 }, { mvp: w.a.id }); await vote(ev.id, e.id, { [w.a.id]: 8 }, { mvp: w.a.id });
    await vote(ev.id, f.id, { [w.b.id]: 8 }, { mvp: w.b.id }); await vote(ev.id, w.a.id, { [w.b.id]: 8 }, { mvp: w.b.id });
    const crowns = await reigningMvps(db(), [w.c.id, other.id], NOW);
    expect(crowns.get(w.c.id)).toEqual([w.a.id, w.b.id].sort((x, y) => x - y));
    expect(crowns.has(other.id)).toBe(false);
  });
});
