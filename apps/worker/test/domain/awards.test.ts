import { env } from 'cloudflare:test';
import { db, seedCommunity, seedUser } from '../helpers';
import { reviewedMatch, vote } from './awardsFixture';

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
    expect(await db().$count((await import('../../src/db/schema')).reviewSubmissions)).toBe(0);
  });
});
