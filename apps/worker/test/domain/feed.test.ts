import { eq } from 'drizzle-orm';
import { feedPosts } from '../../src/db/schema';
import { cancelEvent, createEvent, getEvent, joinEvent, leaveEvent, scheduleEvent } from '../../src/domain/events';
import { listFeed } from '../../src/domain/feed';
import { startGameSession } from '../../src/domain/gameStart';
import { editGameResult, finishGameSession, recordGameResult } from '../../src/domain/games';
import { submitReview } from '../../src/domain/ratings';
import { seedUser } from '../helpers';
import { gameFixture } from './gameFixture';

type World = Awaited<ReturnType<typeof gameFixture>>;
const feed = async (w: World) => (await listFeed(w.d, [w.community])).posts;
const kinds = async (w: World) => (await feed(w)).map(p => p.kind).sort();

async function play(w: World) {
  await startGameSession(w.d, w.eventId, w.actorId, { requestId: 'start', expectedRevision: 0 });
  // Team 0 (signups 0..2) beats team 1 twice; its first player scores three.
  const first = await recordGameResult(w.d, w.eventId, w.actorId, { requestId: 'g1', expectedRevision: 1 }, { score: [2, 0], scorers: [{ signupId: w.ids[0], goals: 2 }] });
  if (first.kind !== 'ok') throw new Error(first.kind);
  await recordGameResult(w.d, w.eventId, w.actorId, { requestId: 'g2', expectedRevision: 2 }, { score: [1, 0], scorers: [{ signupId: w.ids[0], goals: 1 }] });
  w.d.now += 3_600_000;
  const done = await finishGameSession(w.d, w.eventId, w.actorId, { requestId: 'finish', expectedRevision: 3 }, w.ids);
  if (done.kind !== 'ok') throw new Error(done.kind);
  return first.protocol.games[0].id;
}

test('news before the match: signup, time, teams; a new time replaces the old wording', async () => {
  const w = await gameFixture(2);
  expect(await kinds(w)).toEqual(['scheduled', 'signup_open', 'teams_ready']);
  const before = (await feed(w)).find(p => p.kind === 'scheduled')!;
  expect(before.text).toContain('20:00');
  expect(before).toMatchObject({ eventId: w.eventId, eventDate: '2026-11-08', community: { id: w.community.id, title: w.community.title } });
  w.d.now += 1000;
  await scheduleEvent(w.d, w.eventId, { startTime: '21:30', durationHours: 2, place: 'Arena' });
  const after = (await feed(w)).filter(p => p.kind === 'scheduled');
  expect(after).toHaveLength(1);
  expect(after[0].text).toContain('21:30');
  expect(after[0].createdAt).toBe(w.d.now);
});

test('«состав собран» appears when the main squad fills and leaves with the first free place', async () => {
  const w = await gameFixture(2);
  const eventId = await createEvent(w.d, { communityId: w.community.id, date: '2026-11-20', comment: null, createdBy: w.actorId });
  const squad = [...w.people];
  while (squad.length < 10) squad.push(await seedUser(`Новый ${squad.length}`, { communityId: w.community.id }));
  for (const p of squad.slice(0, 9)) await joinEvent(w.d, eventId, p.id);
  const full = async () => (await w.d.db.select().from(feedPosts).where(eq(feedPosts.eventId, eventId))).filter(p => p.kind === 'squad_full');
  expect(await full()).toHaveLength(0);
  await joinEvent(w.d, eventId, squad[9].id);
  expect((await full())[0].text).toMatch(/10|основ|Мест/i);
  await leaveEvent(w.d, eventId, squad[9].id);
  expect(await full()).toHaveLength(0);
});

test('a cancelled match leaves the feed', async () => {
  const w = await gameFixture(2);
  expect(await cancelEvent(w.d, w.eventId)).toBe('ok');
  expect(await feed(w)).toEqual([]);
});

test('finishing replaces pre-match news with the stories of the match, winner first', async () => {
  const w = await gameFixture(2);
  await play(w);
  const posts = await feed(w);
  expect(posts[0]).toMatchObject({ kind: 'winner', teamColor: 'red', highlights: ['Красные'] });
  expect(posts.find(p => p.kind === 'hat_trick')).toMatchObject({ userId: w.people[0].id, highlights: ['Игрок 0'] });
  expect(posts.map(p => p.kind)).not.toEqual(expect.arrayContaining(['signup_open']));
  expect(posts.every(p => p.createdAt === (posts[0].createdAt))).toBe(true);
  // Finishing again with the same request changes nothing.
  await finishGameSession(w.d, w.eventId, w.actorId, { requestId: 'finish', expectedRevision: 3 }, w.ids);
  const text = (rows: typeof posts) => rows.map(p => `${p.kind}:${p.text}`);
  expect(text(await feed(w))).toEqual(text(posts));
});

test('a result corrected after the finish rewrites the stories', async () => {
  const w = await gameFixture(2);
  const gameId = await play(w);
  const revision = (await getEvent(w.d.db, w.eventId))!.gameRevision;
  const edited = await editGameResult(w.d, w.eventId, gameId, w.actorId, { requestId: 'fix', expectedRevision: revision }, { score: [0, 4], scorers: [{ signupId: w.ids[3], goals: 4 }] });
  expect(edited.kind).toBe('ok');
  const posts = await feed(w);
  expect(posts[0]).toMatchObject({ kind: 'winner', teamColor: 'blue' });
  expect(posts[0].highlights[0]).toBe('Синие');
  expect(posts.find(p => p.kind === 'hat_trick')).toMatchObject({ userId: w.people[3].id });
  expect(posts.filter(p => p.kind === 'winner')).toHaveLength(1);
});

test('the best-rated player is announced once voting closes, from published aggregates only', async () => {
  const w = await gameFixture(2);
  await play(w);
  const ev = (await getEvent(w.d.db, w.eventId))!;
  for (const voter of w.people.slice(1, 4)) {
    const scores = [{ userId: w.people[0].id, score: 9 }, { userId: w.people[4].id, score: 6 }];
    expect(await submitReview(w.d, ev, voter.id, { scores, gameScore: 8, skipped: false })).toBe('ok');
  }
  expect(await kinds(w)).not.toContain('top_rated');
  w.d.now += 73 * 3_600_000;
  const post = (await feed(w))[0];
  expect(post).toMatchObject({ kind: 'top_rated', userId: w.people[0].id, highlights: ['Игрок 0'] });
  expect(post.text).toContain('9,0');
  expect((await feed(w)).filter(p => p.kind === 'top_rated')).toHaveLength(1);
});

test('too few votes: nobody is announced', async () => {
  const w = await gameFixture(2);
  await play(w);
  const ev = (await getEvent(w.d.db, w.eventId))!;
  await submitReview(w.d, ev, w.people[1].id, { scores: [{ userId: w.people[0].id, score: 10 }], gameScore: 8, skipped: false });
  w.d.now += 73 * 3_600_000;
  expect(await kinds(w)).not.toContain('top_rated');
});
