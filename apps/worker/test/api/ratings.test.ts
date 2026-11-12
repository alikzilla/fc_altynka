import { REVIEW_WINDOW_MS, type MatchReviewDto, type PlayerProfileDto, type PlayersDto, type SkillAnswers } from '@altynka/core';
import { eq } from 'drizzle-orm';
import { communities, events, signups, users } from '../../src/db/schema';
import { createEvent } from '../../src/domain/events';
import { apiRequest, db, seedUser } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
const skills: SkillAnswers = { teamwork: 6, dribbling: 6, technique: 6, shooting: 6, stamina: 6, physical: 6, passing: 6, defending: 6 };
beforeEach(async () => {
  w = await setupApiWorld(); w.clock.now = Date.UTC(2026, 10, 5, 15);
  for (const id of [w.player.id, w.org.id, w.admin.id, 10, 11, 12]) w.tg.members.add(id);
});
afterEach(teardownApiWorld);
const request = (path: string, as = w.player, body?: unknown, method = body === undefined ? 'GET' : 'POST') =>
  apiRequest(path, { as, body, method, at: w.clock.now });

async function playedMatch() {
  const eventId = await createEvent({ db: db(), now: w.clock.now - 3600000, sync: w.sync }, { communityId: w.communityId, date: '2026-11-05', comment: null, createdBy: w.orgUserId });
  await db().update(events).set({ protocolVersion: 0, status: 'scheduled', startTime: '19:00', durationHours: 1 }).where(eq(events.id, eventId));
  const extra = await Promise.all([10, 11, 12].map(tgId => seedUser(`Партнёр ${tgId}`, { tgId, communityId: w.communityId })));
  const people = [w.playerUserId, w.orgUserId, ...extra.map(u => u.id)];
  const roster = await db().insert(signups).values(people.map((userId, seq) => ({ eventId, userId, seq: seq + 1, createdAt: 1 }))).returning();
  return { eventId, roster, extra };
}

test('skills require all eight integer answers and produce the same rating in public and own profiles', async () => {
  expect((await request('/api/me/skills', w.player, { teamwork: 6 }, 'PUT')).status).toBe(400);
  expect((await request('/api/me/skills', w.player, { ...skills, passing: 10.5 }, 'PUT')).status).toBe(400);
  expect((await request('/api/me/skills', w.player, skills, 'PUT')).status).toBe(200);
  const profile = await (await request(`/api/players/${w.playerUserId}`)).json() as PlayerProfileDto;
  expect(profile.rating).toMatchObject({ value: 6, initial: 6, selfAssessment: skills, matchesCount: 0 });
  expect(await (await request('/api/me')).json()).toMatchObject({ rating: { value: 6 } });
  expect((await request('/api/me/skills', w.player, skills, 'PUT')).status).toBe(200);
  expect((await request('/api/me/skills', w.player, { ...skills, teamwork: 10 }, 'PUT')).status).toBe(409);
  const list = await (await request('/api/players')).json() as PlayersDto;
  expect(list.groups.map(g => g.community.id)).toEqual([w.communityId]);
  expect(list.groups[0].players.find(p => p.userId === w.playerUserId)?.rating.value).toBe(6);
  expect(JSON.stringify(list)).not.toMatch(/kaspiPhone|tgId|notificationsEnabled/);
});

test('only organizer confirms actual participants once; billing is independent', async () => {
  const { eventId, roster } = await playedMatch();
  const path = `/api/events/${eventId}/finish`;
  const body = { participantSignupIds: roster.slice(0, 4).map(s => s.id) };
  expect((await request(path, w.player, body)).status).toBe(403);
  expect((await request(path, w.org, { participantSignupIds: [999999] })).status).toBe(400);
  expect((await request(path, w.org, body)).status).toBe(200);
  expect((await request(path, w.org, body)).status).toBe(200);
  expect((await request(path, w.org, { participantSignupIds: roster.map(s => s.id) })).status).toBe(409);
  expect((await db().select().from(events).where(eq(events.id, eventId)))[0].status).toBe('scheduled');
  expect((await request(`/api/events/${eventId}/cancel`, w.org, {})).status).toBe(409);
});

test('reviews accept only actual participants, no self vote, duplicate target or guest identity', async () => {
  const { eventId, roster, extra } = await playedMatch();
  await request(`/api/events/${eventId}/finish`, w.org, { participantSignupIds: roster.slice(0, 4).map(s => s.id) });
  const path = `/api/events/${eventId}/review`;
  const review = { scores: [{ userId: w.playerUserId, score: 8 }], gameScore: null, skipped: false };
  expect((await request(path, w.player, review)).status).toBe(400);
  expect((await request(path, { id: extra[2].tgId, first_name: 'Резерв' }, review)).status).toBe(403);
  expect((await request(path, w.org, { ...review, scores: [...review.scores, ...review.scores] })).status).toBe(400);
  expect((await request(path, w.org, { ...review, scores: [{ userId: 99999, score: 8 }] })).status).toBe(400);
  expect((await request(path, w.org, { ...review, scores: [] })).status).toBe(400);
  expect((await request(path, w.org, { ...review, scores: [], gameScore: 7 })).status).toBe(200);
});

test('submission is final and identical concurrent retries are idempotent', async () => {
  const { eventId, roster } = await playedMatch();
  await request(`/api/events/${eventId}/finish`, w.org, { participantSignupIds: roster.map(s => s.id) });
  const path = `/api/events/${eventId}/review`;
  const body = { scores: [{ userId: w.playerUserId, score: 8 }], gameScore: 9, skipped: false };
  const retries = await Promise.all([request(path, w.org, body), request(path, w.org, body)]);
  expect(retries.map(r => r.status)).toEqual([200, 200]);
  expect((await request(path, w.org, { ...body, gameScore: 5 })).status).toBe(409);
  const own = await (await request(path, w.org)).json() as MatchReviewDto;
  expect(own.state).toBe('submitted');
  expect(own.ownSubmission).toEqual(body);
  const other = await (await request(path, w.player)).json() as MatchReviewDto;
  expect(other.ownSubmission).toBeNull();
  expect(other.participants.every(p => p.score === null)).toBe(true);
  expect(other.gameScore).toBeNull();
});

test('results publish only after 72 hours with three distinct votes and change the team rating', async () => {
  const { eventId, roster, extra } = await playedMatch();
  await request('/api/me/skills', w.player, skills, 'PUT');
  await request(`/api/events/${eventId}/finish`, w.org, { participantSignupIds: roster.map(s => s.id) });
  const path = `/api/events/${eventId}/review`;
  const body = { scores: [{ userId: w.playerUserId, score: 8 }], gameScore: 9, skipped: false };
  for (const as of [w.org, ...extra.slice(0, 2).map(u => ({ id: u.tgId, first_name: u.firstName }))]) {
    expect((await request(path, as, body)).status).toBe(200);
  }
  w.clock.now += REVIEW_WINDOW_MS - 1;
  expect(await (await request(`/api/players/${w.playerUserId}`)).json()).toMatchObject({ rating: { value: 6, matchesCount: 0 } });
  w.clock.now += 1;
  const result = await (await request(path)).json() as MatchReviewDto;
  expect(result.state).toBe('closed');
  expect(result.gameScore).toBe(9);
  expect(result.participants.find(p => p.userId === w.playerUserId)?.score).toBe(8);
  expect((await request(path, w.player, { scores: [{ userId: w.orgUserId, score: 5 }], gameScore: null, skipped: false })).status).toBe(409);
  const profile = await (await request(`/api/players/${w.playerUserId}`)).json() as PlayerProfileDto;
  expect(profile.rating).toMatchObject({ value: 6.5, matchesCount: 1 });
  expect(profile.history[0]).toMatchObject({ eventId, score: 8 });
  expect(JSON.stringify(profile)).not.toMatch(/author|scores|payload|kaspi|tgId|votes/);
});

test('two votes stay private, explicit skip is final, and no response is never a zero', async () => {
  const { eventId, roster, extra } = await playedMatch();
  await request(`/api/events/${eventId}/finish`, w.org, { participantSignupIds: roster.map(s => s.id) });
  const path = `/api/events/${eventId}/review`;
  const body = { scores: [{ userId: w.playerUserId, score: 1 }], gameScore: 1, skipped: false };
  await request(path, w.org, body);
  await request(path, { id: extra[0].tgId, first_name: extra[0].firstName }, body);
  const skip = { scores: [], gameScore: null, skipped: true };
  expect((await request(path, w.player, skip)).status).toBe(200);
  expect((await request(path, w.player, { ...skip, gameScore: 6, skipped: false })).status).toBe(409);
  w.clock.now += REVIEW_WINDOW_MS;
  const profile = await (await request(`/api/players/${w.playerUserId}`)).json() as PlayerProfileDto;
  expect(profile.rating.value).toBe(5);
  expect(profile.history[0].score).toBeNull();
  expect((await (await request(path)).json() as MatchReviewDto).gameScore).toBeNull();
});

test('upcoming, cancelled and pre-migration matches cannot be finished', async () => {
  const { eventId, roster } = await playedMatch();
  const body = { participantSignupIds: roster.map(s => s.id) };
  await db().update(events).set({ startTime: '23:00' }).where(eq(events.id, eventId));
  expect((await request(`/api/events/${eventId}/finish`, w.org, body)).status).toBe(409);
  await db().update(events).set({ status: 'cancelled' }).where(eq(events.id, eventId));
  expect((await request(`/api/events/${eventId}/finish`, w.org, body)).status).toBe(409);
  const [legacy] = await db().insert(events).values({ communityId: w.communityId, date: '2026-11-05', status: 'scheduled', startTime: '19:00', durationHours: 1, createdBy: w.orgUserId, createdAt: 0 }).returning();
  expect((await request(`/api/events/${legacy.id}/finish`, w.org, body)).status).toBe(409);
});

test('public player profiles are scoped to the community', async () => {
  const outsider = await seedUser('В другой группе', { tgId: 888 });
  expect((await request(`/api/players/${outsider.id}`)).status).toBe(404);
  expect((await request('/api/players', w.player)).status).toBe(200);
});

test('saved teams freeze ratings while future generations get the current rating', async () => {
  const { eventId, roster } = await playedMatch();
  await db().update(events).set({ startTime: '23:00' }).where(eq(events.id, eventId));
  const teams = [roster.slice(0, 3).map(s => s.id), roster.slice(3).map(s => s.id)];
  expect((await request(`/api/events/${eventId}/teams`, w.org, { teamCount: 2, teams, guestLevels: {} }, 'PUT')).status).toBe(200);
  await request('/api/me/skills', w.player, skills, 'PUT');
  const detail = await (await request(`/api/events/${eventId}`, w.org)).json() as { main: { userId: number; level: number }[]; teams: { ratingSnapshot: Record<number, number> } };
  expect(detail.main.find(p => p.userId === w.playerUserId)?.level).toBe(6);
  expect(detail.teams.ratingSnapshot[roster[0].id]).toBe(5);
  const savedRatings = detail.teams.ratingSnapshot;
  expect((await request(`/api/events/${eventId}/teams`, w.org, { teamCount: 2, teams, guestLevels: {}, refreshRatings: false, ratingSnapshot: savedRatings }, 'PUT')).status).toBe(200);
  const afterRepublish = await (await request(`/api/events/${eventId}`, w.org)).json() as typeof detail;
  expect(afterRepublish.teams.ratingSnapshot[roster[0].id]).toBe(5);
  expect((await request(`/api/events/${eventId}/teams`, w.org, { teamCount: 2, teams, guestLevels: {}, refreshRatings: true, ratingSnapshot: savedRatings }, 'PUT')).status).toBe(409);
  expect((await request(`/api/events/${eventId}/teams`, w.org, { teamCount: 2, teams, guestLevels: {}, refreshRatings: true, ratingSnapshot: { ...savedRatings, [roster[0].id]: 6 } }, 'PUT')).status).toBe(200);
  const regenerated = await (await request(`/api/events/${eventId}`, w.org)).json() as typeof detail;
  expect(regenerated.teams.ratingSnapshot[roster[0].id]).toBe(6);
});

test('tasks request the skills once and reviews only for eligible unsubmitted participants', async () => {
  const tasks = async () => (await (await request('/api/notifications')).json() as { tasks: { kind: string }[] }).tasks;
  expect((await tasks()).some(t => t.kind === 'skills')).toBe(true);
  await request('/api/me/skills', w.player, skills, 'PUT');
  expect((await tasks()).some(t => t.kind === 'skills')).toBe(false);
  const { eventId, roster } = await playedMatch();
  await request(`/api/events/${eventId}/finish`, w.org, { participantSignupIds: roster.map(s => s.id) });
  expect((await tasks()).some(t => t.kind === 'review')).toBe(true);
  await request(`/api/events/${eventId}/review`, w.player, { scores: [], gameScore: null, skipped: true });
  expect((await tasks()).some(t => t.kind === 'review')).toBe(false);
});

test('guests are frozen as participants but cannot receive votes or lend their inviter an extra vote', async () => {
  const { eventId, roster } = await playedMatch();
  const [guest] = await db().insert(signups).values({ eventId, userId: null, guestName: 'Друг', invitedBy: w.playerUserId, seq: 6, createdAt: 1 }).returning();
  expect((await request(`/api/events/${eventId}/finish`, w.org, { participantSignupIds: [...roster.map(s => s.id), guest.id] })).status).toBe(200);
  const review = await (await request(`/api/events/${eventId}/review`)).json() as MatchReviewDto;
  expect(review.participants).toHaveLength(5);
  expect(review.participants.some(p => p.name === 'Друг')).toBe(false);
  expect((await request(`/api/events/${eventId}/review`, w.player, { authorId: w.orgUserId, scores: [], gameScore: 7, skipped: false })).status).toBe(400);
});

test('finish and review endpoints do not reveal or mutate another community event', async () => {
  const [community] = await db().insert(communities).values({ tgChatId: -999, title: 'Другая группа' }).returning();
  // Nobody of this world is in that chat (FakeTg would otherwise fall back to the default member set).
  w.tg.chatMembers.set(-999, new Set()); w.tg.chatAdmins.set(-999, new Set());
  const id = await createEvent({ db: db(), now: w.clock.now, sync: w.sync }, { communityId: community.id, date: '2026-11-05', comment: null, createdBy: w.orgUserId });
  expect((await request(`/api/events/${id}/review`)).status).toBe(404);
  expect((await request(`/api/events/${id}/finish`, w.org, { participantSignupIds: [1] })).status).toBe(404);
  expect((await request(`/api/events/${id}/review`, w.player, { scores: [], gameScore: 7, skipped: false })).status).toBe(404);
});

test('a first survey after rated games replaces only the initial estimate', async () => {
  const { eventId, roster, extra } = await playedMatch();
  await request(`/api/events/${eventId}/finish`, w.org, { participantSignupIds: roster.map(s => s.id) });
  for (const as of [w.org, ...extra.slice(0, 2).map(u => ({ id: u.tgId, first_name: u.firstName }))]) {
    await request(`/api/events/${eventId}/review`, as, { scores: [{ userId: w.playerUserId, score: 8 }], gameScore: null, skipped: false });
  }
  w.clock.now += REVIEW_WINDOW_MS;
  expect(await (await request('/api/me')).json()).toMatchObject({ rating: { value: 5.8, initial: 5, matchesCount: 1 } });
  await request('/api/me/skills', w.player, skills, 'PUT');
  expect(await (await request('/api/me')).json()).toMatchObject({ rating: { value: 6.5, initial: 6, matchesCount: 1 } });
});
test('a peer in the same group sees the pinned achievement on the sports profile', async () => {
  expect((await request(`/api/players/${w.playerUserId}`, w.org)).status).toBe(200);
  expect(await (await request(`/api/players/${w.playerUserId}`, w.org)).json()).toMatchObject({ pinnedAchievement: null });
  expect((await request('/api/me', w.player, { pinnedAchievement: 'winner' }, 'PATCH')).status).toBe(200);
  expect(await (await request(`/api/players/${w.playerUserId}`, w.org)).json()).toMatchObject({ pinnedAchievement: 'winner' });
});

test('statistics list only the groups of the viewer', async () => {
  const [foreign] = await db().insert(communities).values({ tgChatId: -777, title: 'Чужая' }).returning();
  const stranger = await seedUser('Чужой', { communityId: foreign.id });
  const state = (userId: number) => JSON.stringify({ teamCount: 2, roster: [{ signupId: 1, userId, name: 'x', teamIndex: 0 }], initialPair: [0, 1], currentPair: [0, 1], receipts: [], finishParticipants: null,
    games: [{ id: 'g1', sequence: 1, pair: [0, 1], score: [1, 0], scorers: [{ signupId: 1, goals: 1 }], assists: [], firstRestTeamIndex: null, recordedAt: 1, recordedBy: userId, updatedAt: 1, updatedBy: userId }] });
  await db().insert(events).values([
    { communityId: w.communityId, date: '2026-11-01', status: 'closed', protocolVersion: 1, startedAt: 1, gameStateJson: state(w.playerUserId), createdBy: w.orgUserId, createdAt: 1 },
    { communityId: foreign.id, date: '2026-11-01', status: 'closed', protocolVersion: 1, startedAt: 1, gameStateJson: state(stranger.id), createdBy: stranger.id, createdAt: 1 },
  ]);
  const res = await request('/api/statistics');
  expect(res.status).toBe(200);
  const body = await res.json<import('@altynka/core').LeaderboardDto>();
  expect(body.groups).toHaveLength(1);
  expect(body.groups[0].community.id).toBe(w.communityId);
  expect(body.groups[0].players).toMatchObject([{ userId: w.playerUserId, games: 1, goals: 1, wins: 1, assistsTracked: true }]);
});

test('the players list and a peer profile carry the saved Telegram photo', async () => {
  await db().update(users).set({ photoUrl: 'https://t.me/i/userpic/org.jpg' }).where(eq(users.id, w.orgUserId));
  const list = await (await request('/api/players')).json<PlayersDto>();
  expect(list.groups[0].players.find(p => p.userId === w.orgUserId)?.photoUrl).toBe('https://t.me/i/userpic/org.jpg');
  expect(list.groups[0].players.find(p => p.userId === w.playerUserId)?.photoUrl).toBeNull();
  const profile = await (await request(`/api/players/${w.orgUserId}`)).json<PlayerProfileDto>();
  expect(profile.photoUrl).toBe('https://t.me/i/userpic/org.jpg');
});

test('the match roster carries the Telegram photo of players', async () => {
  await db().update(users).set({ photoUrl: 'https://t.me/i/userpic/org.jpg' }).where(eq(users.id, w.orgUserId));
  const { eventId } = await playedMatch();
  const detail = await (await request(`/api/events/${eventId}`)).json<import('@altynka/core').EventDetailDto>();
  expect(detail.main.find(s => s.userId === w.orgUserId)?.photoUrl).toBe('https://t.me/i/userpic/org.jpg');
  expect(detail.main.find(s => s.userId === w.playerUserId)?.photoUrl).toBeNull();
});
