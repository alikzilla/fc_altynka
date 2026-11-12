import { eq } from 'drizzle-orm';
import { communities, events, memberships } from '../../src/db/schema';
import { leaderboard } from '../../src/domain/leaderboard';
import { db, seedUser } from '../helpers';

async function world() {
  const [a, b] = await db().insert(communities).values([{ tgChatId: -101, title: 'Альфа' }, { tgChatId: -102, title: 'Бета' }]).returning();
  const scorer = await seedUser('Алихан', { communityId: a.id });
  const passer = await seedUser('Дамир', { communityId: a.id });
  await db().insert(memberships).values({ communityId: b.id, userId: scorer.id });
  return { a, b, scorer, passer };
}
/** One short game 2:1; the scorer (team 0) scores twice, the passer (team 1) assists a guest's goal. */
async function session(communityId: number, scorerId: number, passerId: number, over: { status?: 'closed' | 'cancelled'; startedAt?: number | null; assists?: boolean } = {}) {
  const game = { id: 'g1', sequence: 1, pair: [0, 1], score: [2, 1], scorers: [{ signupId: 101, goals: 2 }, { signupId: 103, goals: 1 }],
    ...(over.assists === false ? {} : { assists: [{ signupId: 103, assistSignupId: 102, goals: 1 }] }),
    firstRestTeamIndex: null, recordedAt: 1, recordedBy: scorerId, updatedAt: 1, updatedBy: scorerId };
  const state = { teamCount: 2, roster: [{ signupId: 101, userId: scorerId, name: 'A', teamIndex: 0 }, { signupId: 102, userId: passerId, name: 'B', teamIndex: 1 },
    { signupId: 103, userId: null, name: 'Гость', teamIndex: 1 }], initialPair: [0, 1], currentPair: [0, 1], receipts: [], finishParticipants: null, games: [game] };
  await db().insert(events).values({ communityId, date: '2026-11-06', status: over.status ?? 'closed', protocolVersion: 1,
    startedAt: over.startedAt === undefined ? 1 : over.startedAt, gameStateJson: JSON.stringify(state), createdBy: scorerId, createdAt: 1 });
}
const groupsOf = (w: Awaited<ReturnType<typeof world>>) => [{ id: w.a.id, title: w.a.title }, { id: w.b.id, title: w.b.title }];

test('totals are counted per group from stored protocols; guests and unplayed members are not listed', async () => {
  const w = await world();
  await seedUser('Запасной', { communityId: w.a.id });
  await session(w.a.id, w.scorer.id, w.passer.id); await session(w.a.id, w.scorer.id, w.passer.id);
  await session(w.b.id, w.scorer.id, w.passer.id);
  const result = await leaderboard(db(), groupsOf(w), 2);
  expect(result.groups.map(g => g.community.title)).toEqual(['Альфа', 'Бета']);
  expect(result.groups[0].players).toMatchObject([
    { userId: w.scorer.id, displayName: 'Алихан', meetings: 2, games: 2, goals: 4, assists: 0, wins: 2, assistsTracked: true },
    { userId: w.passer.id, displayName: 'Дамир', meetings: 2, games: 2, goals: 0, assists: 2, wins: 0 },
  ]);
  // Дамир сыграл в «Бете» по протоколу, но не состоит в ней.
  expect(result.groups[1].players).toMatchObject([{ userId: w.scorer.id, games: 1, goals: 2 }]);
});

test('cancelled and unstarted matches are skipped, a member who left disappears, old games keep assists unknown', async () => {
  const w = await world();
  await session(w.a.id, w.scorer.id, w.passer.id, { assists: false });
  await session(w.a.id, w.scorer.id, w.passer.id, { status: 'cancelled' });
  await session(w.a.id, w.scorer.id, w.passer.id, { startedAt: null });
  expect((await leaderboard(db(), groupsOf(w), 2)).groups[0].players).toMatchObject([
    { userId: w.scorer.id, games: 1, goals: 2, assistsTracked: false }, { userId: w.passer.id, games: 1, assistsTracked: false }]);
  await db().update(memberships).set({ active: false }).where(eq(memberships.userId, w.passer.id));
  expect((await leaderboard(db(), groupsOf(w), 2)).groups[0].players.map(p => p.userId)).toEqual([w.scorer.id]);
  expect(await leaderboard(db(), [], 2)).toEqual({ groups: [] });
});
