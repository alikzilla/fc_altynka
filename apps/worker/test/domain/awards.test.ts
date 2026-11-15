import type { ReviewInput } from '@altynka/core';
import { env } from 'cloudflare:test';
import { reviewSubmissions } from '../../src/db/schema';
import { matchReview, submitReview } from '../../src/domain/ratings';
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
