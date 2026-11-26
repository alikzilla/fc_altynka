import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { availabilityDays, billLines, bills, events, feedPosts, feedReactions, matchParticipants, memberships, playerVotes, signups, skillAssessments, users } from '../../src/db/schema';
import { createEvent, joinEvent } from '../../src/domain/events';
import { DELETED_NAME, deleteMyData } from '../../src/domain/privacy';
import { FakeSync } from '../fakes/fakeSync';
import { db, seedCommunity, seedUser, setMemberProfile } from '../helpers';
import { reviewedMatch, vote } from './awardsFixture';

const NOW = Date.UTC(2026, 10, 24, 12);
let communityId: number;
let sync: FakeSync;
const deps = () => ({ db: db(), now: NOW, sync });
const userRow = async (id: number) => (await db().select().from(users).where(eq(users.id, id)))[0];

beforeEach(async () => { communityId = (await seedCommunity()).id; sync = new FakeSync(); });

async function player(name: string, tgId: number) {
  const u = await seedUser(name, { communityId, tgId });
  await setMemberProfile(u.id, { lastName: 'Сатпаев', username: `${name.toLowerCase()}_tg`, kaspiPhone: '+77071234567', photoUrl: 'https://t.me/i/p.jpg', playingPosition: 'forward', dominantFoot: 'left', notificationsEnabled: true, pmAvailable: true, profileCompletedAt: 1 });
  return u;
}

test('the profile is wiped and detached from Telegram; the next sign-in starts from scratch', async () => {
  const u = await player('Тимур', 501);
  await env.DB.prepare('UPDATE users SET favorite_club = ? WHERE id = ?').bind('barcelona', u.id).run();
  await env.DB.prepare('INSERT INTO skill_assessments(user_id, teamwork, dribbling, technique, shooting, stamina, physical, passing, defending, created_at) VALUES (?,5,5,5,5,5,5,5,5,0)').bind(u.id).run();
  await db().insert(availabilityDays).values({ userId: u.id, date: '2026-11-25', status: 'yes', parts: '[]', updatedAt: 0 } as never);
  expect(await deleteMyData(deps(), u.id)).toEqual({ kind: 'deleted' });
  const row = await userRow(u.id);
  expect(row).toMatchObject({
    tgId: -u.id, firstName: DELETED_NAME, displayName: DELETED_NAME, lastName: null, username: null, kaspiPhone: null, photoUrl: null,
    playingPosition: null, dominantFoot: null, notificationsEnabled: false, pmAvailable: false, profileCompletedAt: null, deletedAt: NOW, favoriteClub: null,
  });
  expect(await db().select().from(skillAssessments)).toEqual([]);
  expect(await db().select().from(availabilityDays)).toEqual([]);
  // Gone from the group lists, kept for history.
  expect((await db().select().from(memberships).where(eq(memberships.userId, u.id)))[0]).toMatchObject({ active: false, injured: false });
  // Telegram ID 501 is free again: a new sign-in gets a new, empty profile.
  const fresh = await seedUser('Новый', { tgId: 501 });
  expect(fresh.id).not.toBe(u.id);
});

test('deleting twice is harmless', async () => {
  const u = await player('Тимур', 501);
  await deleteMyData(deps(), u.id);
  expect(await deleteMyData(deps(), u.id)).toEqual({ kind: 'deleted' });
  expect(await deleteMyData(deps(), 999_999)).toEqual({ kind: 'not_found' });
});

test('upcoming signups are cancelled through the queue, so the reserve moves up and the group message refreshes', async () => {
  const u = await player('Тимур', 501);
  const other = await player('Арман', 502);
  const ev = await createEvent({ db: db(), now: NOW, sync }, { communityId, createdBy: other.id, date: '2099-12-31', comment: null });
  await db().update(events).set({ baseLimit: 1 }).where(eq(events.id, ev));
  await joinEvent(deps(), ev, u.id);
  await joinEvent(deps(), ev, other.id);
  sync.calls = [];
  await deleteMyData(deps(), u.id);
  const mine = (await db().select().from(signups).where(eq(signups.userId, u.id)))[0];
  expect(mine.leftAt).toBe(NOW);
  expect(sync.calls.some(c => c.eventId === ev)).toBe(true);
});

test('an open bill where the person receives the money blocks deletion; their own debt does not', async () => {
  const receiver = await player('Тимур', 501);
  const debtor = await player('Арман', 502);
  const ev = await createEvent({ db: db(), now: NOW, sync }, { communityId, createdBy: receiver.id, date: '2026-11-20', comment: null });
  const [bill] = await db().insert(bills).values({ eventId: ev, receiverUserId: receiver.id, fieldAmount: 20000, share: 10000, createdAt: 0 }).returning();
  await db().insert(billLines).values([{ billId: bill.id, userId: receiver.id, units: 1, amount: 10000 }, { billId: bill.id, userId: debtor.id, units: 1, amount: 10000 }] as never);
  expect(await deleteMyData(deps(), receiver.id)).toEqual({ kind: 'receiver_open_bill' });
  expect((await userRow(receiver.id)).deletedAt).toBeNull();
  // The debtor leaves; the unpaid line stays, under the anonymous name.
  expect(await deleteMyData(deps(), debtor.id)).toEqual({ kind: 'deleted' });
  expect(await db().select().from(billLines).where(eq(billLines.userId, debtor.id))).toHaveLength(1);
  // Once the bill is closed, the receiver can leave too.
  await db().update(bills).set({ status: 'closed' }).where(eq(bills.id, bill.id));
  expect(await deleteMyData(deps(), receiver.id)).toEqual({ kind: 'deleted' });
});

test('match history keeps the numbers but loses the name: participants, roster and game protocol', async () => {
  const u = await player('Тимур', 501);
  const a = await player('Арман', 502);
  const b = await player('Данияр', 503);
  const ev = await reviewedMatch(communityId, [u.id, a.id, b.id], { names: { [u.id]: 'Тимур С.', [a.id]: 'Арман', [b.id]: 'Данияр' } });
  await db().update(events).set({ gameStateJson: JSON.stringify({ teamCount: 3, roster: [{ signupId: 1, userId: u.id, name: 'Тимур С.', team: 0 }, { signupId: 2, userId: a.id, name: 'Арман', team: 1 }], games: [] }) }).where(eq(events.id, ev.id));
  await vote(ev.id, a.id, { [u.id]: 8, [b.id]: 6 });
  await deleteMyData(deps(), u.id);
  const names = await db().select({ userId: matchParticipants.userId, name: matchParticipants.name }).from(matchParticipants).where(eq(matchParticipants.eventId, ev.id));
  expect(names.find(n => n.userId === u.id)?.name).toBe(DELETED_NAME);
  expect(names.find(n => n.userId === a.id)?.name).toBe('Арман');
  const review = await env.DB.prepare('SELECT roster_json FROM match_reviews WHERE event_id = ?').bind(ev.id).first<{ roster_json: string }>();
  expect(JSON.parse(review!.roster_json).map((r: { name: string }) => r.name)).toEqual([DELETED_NAME, 'Арман', 'Данияр']);
  const state = JSON.parse((await db().select().from(events).where(eq(events.id, ev.id)))[0].gameStateJson!);
  expect(state.roster.map((r: { name: string }) => r.name)).toEqual([DELETED_NAME, 'Арман']);
  // Anonymous ratings of others stay intact.
  expect(await db().select().from(playerVotes).where(eq(playerVotes.recipientId, b.id))).toHaveLength(1);
});

test('posts about the person disappear; other posts lose the name, whole words only', async () => {
  const u = await player('Тимур', 501);
  const a = await player('Арман', 502);
  const ev = await reviewedMatch(communityId, [u.id, a.id], { names: { [u.id]: 'Тимур С.', [a.id]: 'Арман' } });
  const post = (o: Partial<typeof feedPosts.$inferInsert> & { slot: string }): typeof feedPosts.$inferInsert => ({ communityId, eventId: ev.id, kind: 'hat_trick', variant: 0, text: '', createdAt: 0, ...o });
  await db().insert(feedPosts).values([
    post({ slot: 'about', userId: u.id, text: 'Тимур С. забил три', highlightsJson: '["Тимур С."]' }),
    post({ slot: 'ceremony', userId: null, text: 'MVP — Тимур С., лучший пас — Арман. Тимуровцы рады.', highlightsJson: '["Тимур С.","Арман"]', payloadJson: JSON.stringify([{ award: 'mvp', userId: u.id, title: 'MVP', text: 'Тимур С. лучший' }]) }),
  ]);
  await db().insert(feedReactions).values([{ eventId: ev.id, slot: 'about', userId: a.id, reaction: 'fire' as never, createdAt: 0 }, { eventId: ev.id, slot: 'ceremony', userId: u.id, reaction: 'fire' as never, createdAt: 0 }]);
  await deleteMyData(deps(), u.id);
  const left = await db().select().from(feedPosts);
  expect(left.map(p => p.slot)).toEqual(['ceremony']);
  expect(left[0].text).toBe(`MVP — ${DELETED_NAME}, лучший пас — Арман. Тимуровцы рады.`);
  expect(JSON.parse(left[0].highlightsJson)).toEqual([DELETED_NAME, 'Арман']);
  expect(JSON.parse(left[0].payloadJson!)[0].text).toBe(`${DELETED_NAME} лучший`);
  // Reactions on the removed post and the person's own reactions are gone.
  expect(await db().select().from(feedReactions)).toEqual([]);
});

test('no new post is written about a deleted person when the votes close', async () => {
  const { publishClosedVotes } = await import('../../src/domain/feed');
  const [u, a, b, c] = [await player('Тимур', 501), await player('Арман', 502), await player('Данияр', 503), await player('Ерлан', 504)];
  const ev = await reviewedMatch(communityId, [u.id, a.id, b.id, c.id], { closesAt: NOW - 1 });
  // Тимур is the best rated, Арман second.
  await vote(ev.id, a.id, { [u.id]: 10, [b.id]: 7 });
  await vote(ev.id, b.id, { [u.id]: 10, [a.id]: 8 });
  await vote(ev.id, c.id, { [u.id]: 10, [a.id]: 8 });
  await vote(ev.id, u.id, { [a.id]: 8 });
  await deleteMyData(deps(), u.id);
  await publishClosedVotes(deps(), [communityId]);
  const top = (await db().select().from(feedPosts)).filter(p => p.kind === 'top_rated');
  expect(top.map(p => p.userId)).toEqual([a.id]);
});
