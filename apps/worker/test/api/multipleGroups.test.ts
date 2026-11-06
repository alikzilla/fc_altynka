import type { EventDetailDto, EventsListDto, MeDto, NotificationsDto, PlayerProfileDto, PlayersDto } from '@altynka/core';
import { and, eq } from 'drizzle-orm';
import { billLines, bills, communities, events, matchReviews, memberships, signups, users, type EventRow } from '../../src/db/schema';
import { bindCommunity, ensureMembership } from '../../src/domain/members';
import { createEvent } from '../../src/domain/events';
import { apiRequest, db, seedUser } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

// World: A ("Футбол") — admin, org, player. B ("Альфа") — player (as player) and orgB (organizer).
let w: ApiWorld;
let b: number;
let orgBUserId: number;
const orgB = { id: 3001, first_name: 'Орг Б' };
const FUTURE = '2099-12-31';
beforeEach(async () => {
  w = await setupApiWorld();
  b = (await bindCommunity(db(), -100600, 'Альфа')).id;
  orgBUserId = (await seedUser('Орг Б', { communityId: b, tgId: orgB.id, role: 'organizer' })).id;
  await ensureMembership(db(), b, w.playerUserId, w.clock.now);
  w.tg.chatMembers.set(-100600, new Set([w.player.id, orgB.id]));
  w.tg.chatAdmins.set(-100600, new Set());
});
afterEach(teardownApiWorld);

const deps = () => ({ db: db(), now: w.clock.now, sync: w.sync });
const match = (communityId: number, createdBy: number) => createEvent(deps(), { communityId, createdBy, date: FUTURE, comment: null });

async function billIn(communityId: number, receiverUserId: number, lineUsers: number[]) {
  const [ev] = await db().insert(events).values({ communityId, date: '2026-11-01', status: 'billing', createdBy: receiverUserId, createdAt: 0 }).returning();
  const [bill] = await db().insert(bills).values({ eventId: ev.id, receiverUserId, fieldAmount: 3000, share: 3000, status: 'open', createdAt: 0 }).returning();
  const lines = await db().insert(billLines).values(lineUsers.map(userId => ({ billId: bill.id, userId, units: 1, amount: 3000, paidAmount: null }))).returning();
  return { ev: ev as EventRow, bill, lines };
}

test('user without groups can open the app', async () => {
  const stranger = { id: 9001, first_name: 'Новичок' };
  const me = await apiRequest('/api/me', { as: stranger });
  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({ displayName: 'Новичок', communities: [] });
  // GET /api/events is the list, not caught by the /events/:id scope.
  const list = await apiRequest('/api/events', { as: stranger });
  expect(list.status).toBe(200);
  expect(await list.json()).toEqual({ active: [], past: [] });
  expect(await (await apiRequest('/api/matches', { as: stranger })).json()).toEqual({ events: [], nextCursor: null });
  expect(await (await apiRequest('/api/players', { as: stranger })).json()).toEqual({ groups: [] });
  expect(await (await apiRequest('/api/notifications', { as: stranger })).json()).toEqual({ tasks: [{ kind: 'skills', id: 'skills' }] });
});

test('feed merges groups and labels them', async () => {
  const inA = await match(w.communityId, w.orgUserId);
  const inB = await match(b, orgBUserId);
  const list = await (await apiRequest('/api/events', { as: w.player })).json() as EventsListDto;
  expect(list.active.map(e => [e.id, e.community.title]).sort()).toEqual([[inA, 'Футбол'], [inB, 'Альфа']].sort());
  const onlyA = await (await apiRequest('/api/events', { as: w.org })).json() as EventsListDto;
  expect(onlyA.active.map(e => e.id)).toEqual([inA]);
});

test('create requires organizer role in the chosen group', async () => {
  const create = (as: { id: number; first_name: string }, body: unknown) => apiRequest('/api/events', { method: 'POST', as, body });
  expect((await create(w.org, { date: FUTURE, communityId: w.communityId })).status).toBe(200);
  expect((await create(w.org, { date: FUTURE, communityId: b })).status).toBe(403);
  expect((await create(w.org, { date: FUTURE })).status).toBe(400);
  expect((await create(orgB, { date: FUTURE, communityId: w.communityId })).status).toBe(403);
  expect((await create(w.player, { date: FUTURE, communityId: b })).status).toBe(403);
  expect((await create(orgB, { date: FUTURE, communityId: b })).status).toBe(200);
  expect((await db().select().from(events)).map(e => e.communityId).sort()).toEqual([w.communityId, b].sort());
});

test('foreign event stays hidden', async () => {
  const event = await match(b, orgBUserId);
  expect((await apiRequest(`/api/events/${event}`, { as: w.admin })).status).toBe(404);
  expect((await apiRequest(`/api/events/${event}/join`, { as: w.admin, method: 'POST' })).status).toBe(404);
  expect((await apiRequest(`/api/events/${event}/cancel`, { as: w.admin, method: 'POST' })).status).toBe(404);
  expect((await apiRequest(`/api/events/${event}/teams`, { as: w.admin, method: 'PUT', body: { teamCount: 2, teams: [[], []] } })).status).toBe(404);
  expect((await apiRequest(`/api/events/${event}/review`, { as: w.admin })).status).toBe(404);
  // Role is computed in the event's group: player of B sees it as a player, cannot manage it.
  const asPlayer = await apiRequest(`/api/events/${event}`, { as: w.player });
  expect(asPlayer.status).toBe(200);
  expect(await asPlayer.json() as EventDetailDto).toMatchObject({ id: event, community: { id: b, title: 'Альфа' }, viewerRole: 'player' });
  expect((await apiRequest(`/api/events/${event}/cancel`, { as: w.player, method: 'POST' })).status).toBe(403);
  const asOrgB = await (await apiRequest(`/api/events/${event}`, { as: orgB })).json() as EventDetailDto;
  expect(asOrgB.viewerRole).toBe('organizer');
});

test('foreign signups and bills answer 404', async () => {
  const event = await match(b, orgBUserId);
  await apiRequest(`/api/events/${event}/join`, { as: orgB, method: 'POST' });
  const detail = await (await apiRequest(`/api/events/${event}`, { as: orgB })).json() as EventDetailDto;
  expect((await apiRequest(`/api/signups/${detail.main[0].id}`, { as: w.admin, method: 'DELETE' })).status).toBe(404);
  const { bill, lines } = await billIn(b, orgBUserId, [orgBUserId]);
  expect((await apiRequest(`/api/bills/${bill.id}/close`, { as: w.admin, method: 'POST' })).status).toBe(404);
  expect((await apiRequest(`/api/bills/${bill.id}/paid`, { as: w.admin, method: 'POST' })).status).toBe(404);
  expect((await apiRequest(`/api/bill-lines/${lines[0].id}`, { as: w.admin, method: 'POST', body: { paid: true } })).status).toBe(404);
  expect((await db().select().from(billLines).where(eq(billLines.id, lines[0].id)))[0].paidAmount).toBeNull();
});

test('members management is scoped by query', async () => {
  const patch = (communityId: number | null) => apiRequest(`/api/members/${w.playerUserId}${communityId === null ? '' : `?communityId=${communityId}`}`, { as: w.admin, method: 'PATCH', body: { role: 'organizer' } });
  expect((await patch(w.communityId)).status).toBe(200);
  expect((await patch(b)).status).toBe(403);
  expect((await patch(null)).status).toBe(403);
  const roles = await db().select().from(memberships).where(eq(memberships.userId, w.playerUserId));
  expect(Object.fromEntries(roles.map(m => [m.communityId, m.role]))).toEqual({ [w.communityId]: 'organizer', [b]: 'player' });
  expect((await apiRequest(`/api/members?communityId=${w.communityId}`, { as: w.org })).status).toBe(200);
  expect((await apiRequest(`/api/members?communityId=${b}`, { as: w.org })).status).toBe(403);
  expect((await apiRequest(`/api/members?communityId=${b}`, { as: w.player })).status).toBe(403);
});

test('join hint creates membership', async () => {
  const newbie = { id: 9002, first_name: 'Новый' };
  w.tg.chatMembers.get(-100600)!.add(newbie.id);
  const joined = await apiRequest(`/api/communities/${b}/join`, { as: newbie, method: 'POST' });
  expect(joined.status).toBe(200);
  expect(await joined.json()).toEqual({ community: { id: b, title: 'Альфа' } });
  expect((await (await apiRequest('/api/me', { as: newbie })).json() as MeDto).communities).toEqual([{ id: b, title: 'Альфа', role: 'player' }]);
  const outsider = { id: 9003, first_name: 'Чужой' };
  const before = await db().select().from(memberships);
  expect((await apiRequest(`/api/communities/${b}/join`, { as: outsider, method: 'POST' })).status).toBe(403);
  expect((await apiRequest('/api/communities/99999/join', { as: outsider, method: 'POST' })).status).toBe(403);
  expect(await db().select().from(memberships)).toEqual(before);
});

test('debt survives leaving the group', async () => {
  const first = await billIn(b, orgBUserId, [w.playerUserId, orgBUserId]);
  const second = await billIn(b, orgBUserId, [w.playerUserId, orgBUserId]);
  w.tg.chatMembers.get(-100600)!.delete(w.player.id);
  await db().update(memberships).set({ active: false }).where(and(eq(memberships.communityId, b), eq(memberships.userId, w.playerUserId)));
  const tasks = (await (await apiRequest('/api/notifications', { as: w.player })).json() as NotificationsDto).tasks;
  expect(tasks.filter(t => t.kind === 'payment')).toEqual([first.ev, second.ev].map(ev => expect.objectContaining({ eventId: ev.id, community: { id: b, title: 'Альфа' } })));
  // The group itself is gone from the feed.
  expect((await apiRequest(`/api/events/${first.ev.id}`, { as: w.player })).status).toBe(404);
  const own = first.lines.find(l => l.userId === w.playerUserId)!;
  const foreign = first.lines.find(l => l.userId === orgBUserId)!;
  expect((await apiRequest(`/api/bill-lines/${own.id}`, { as: w.player, method: 'POST', body: { paid: true } })).status).toBe(200);
  expect((await apiRequest(`/api/bill-lines/${foreign.id}`, { as: w.player, method: 'POST', body: { paid: true } })).status).toBe(404);
  expect((await apiRequest(`/api/bills/${second.bill.id}/paid`, { as: w.player, method: 'POST' })).status).toBe(200);
  const lines = await db().select().from(billLines);
  expect(lines.filter(l => l.userId === w.playerUserId).every(l => l.paidAmount === 3000)).toBe(true);
  expect(lines.filter(l => l.userId === orgBUserId).every(l => l.paidAmount === null)).toBe(true);
  // A debtor who left cannot use organizer bill routes.
  expect((await apiRequest(`/api/bills/${second.bill.id}/close`, { as: w.player, method: 'POST' })).status).toBe(404);
});

const leaveB = async () => {
  w.tg.chatMembers.get(-100600)!.delete(w.player.id);
  await db().update(memberships).set({ active: false }).where(and(eq(memberships.communityId, b), eq(memberships.userId, w.playerUserId)));
};

test('payment task carries what is needed to pay without the match page', async () => {
  await db().update(users).set({ kaspiPhone: '+77071234567' }).where(eq(users.id, orgBUserId));
  const { bill } = await billIn(b, orgBUserId, [w.playerUserId, orgBUserId]);
  await leaveB();
  const tasks = (await (await apiRequest('/api/notifications', { as: w.player })).json() as NotificationsDto).tasks;
  expect(tasks.find(t => t.kind === 'payment')).toMatchObject({ billId: bill.id, receiverKaspiPhone: '+77071234567', receiverName: 'Орг Б', due: 3000 });
});

test('no review task after leaving the group', async () => {
  const { ev } = await billIn(b, orgBUserId, [w.playerUserId]);
  const [signup] = await db().insert(signups).values({ eventId: ev.id, userId: w.playerUserId, seq: 1, createdAt: 0 }).returning();
  // The roster trigger fills match_participants.
  await db().insert(matchReviews).values({ eventId: ev.id, completedAt: w.clock.now - 1000, completedBy: orgBUserId, closesAt: w.clock.now + 86_400_000, rosterJson: JSON.stringify([{ signupId: signup.id, userId: w.playerUserId, name: 'Игрок' }]) });
  const reviews = async () => (await (await apiRequest('/api/notifications', { as: w.player })).json() as NotificationsDto).tasks.filter(t => t.kind === 'review');
  expect(await reviews()).toHaveLength(1);
  await leaveB();
  expect(await reviews()).toEqual([]);
});

test('a debtor who left cannot reopen a closed bill', async () => {
  const { bill, lines } = await billIn(b, w.playerUserId, [w.playerUserId, orgBUserId]);
  await db().update(billLines).set({ paidAmount: 3000 });
  await db().update(bills).set({ status: 'closed' }).where(eq(bills.id, bill.id));
  await leaveB();
  w.sync.calls = [];
  const own = lines.find(l => l.userId === w.playerUserId)!;
  const r = await apiRequest(`/api/bill-lines/${own.id}`, { as: w.player, method: 'POST', body: { paid: false } });
  expect(r.status).toBe(403);
  expect((await db().select().from(bills).where(eq(bills.id, bill.id)))[0].status).toBe('closed');
  expect((await db().select().from(billLines).where(eq(billLines.id, own.id)))[0].paidAmount).toBe(3000);
  expect(w.sync.calls).toEqual([]);
});

test('GET /me survives a Telegram failure for one group', async () => {
  const realStatus = w.tg.memberStatus.bind(w.tg);
  w.tg.memberStatus = async (chatId, tgUserId) => {
    if (chatId === -100600) throw new Error('Telegram is down');
    return realStatus(chatId, tgUserId);
  };
  const r = await apiRequest('/api/me', { as: w.player });
  expect(r.status).toBe(200);
  expect((await r.json() as MeDto).communities.map(g => g.title)).toEqual(['Альфа', 'Футбол']);
  // The stored flag decides when Telegram cannot answer.
  await db().update(memberships).set({ active: false }).where(and(eq(memberships.communityId, b), eq(memberships.userId, w.playerUserId)));
  expect((await (await apiRequest('/api/me', { as: w.player })).json() as MeDto).communities.map(g => g.title)).toEqual(['Футбол']);
});

test('shared history skips groups whose bot was removed', async () => {
  const { ev } = await billIn(b, orgBUserId, [orgBUserId]);
  const [signup] = await db().insert(signups).values({ eventId: ev.id, userId: orgBUserId, seq: 1, createdAt: 0 }).returning();
  await db().insert(matchReviews).values({ eventId: ev.id, completedAt: w.clock.now - 2000, completedBy: orgBUserId, closesAt: w.clock.now - 1000, rosterJson: JSON.stringify([{ signupId: signup.id, userId: orgBUserId, name: 'Орг Б' }]) });
  const history = async () => (await (await apiRequest(`/api/players/${orgBUserId}`, { as: w.player })).json() as PlayerProfileDto).history;
  expect((await history()).map(h => h.eventId)).toEqual([ev.id]);
  // Bot removed from B; the membership rows stay active, the group does not. A is still shared.
  await ensureMembership(db(), w.communityId, orgBUserId, w.clock.now);
  await db().update(communities).set({ active: false }).where(eq(communities.id, b));
  expect(await history()).toEqual([]);
});

test('players grouped by community', async () => {
  await db().update(memberships).set({ level: 9 }).where(and(eq(memberships.communityId, b), eq(memberships.userId, w.playerUserId)));
  const r = await apiRequest('/api/players', { as: w.player });
  expect(r.status).toBe(200);
  const { groups } = await r.json() as PlayersDto;
  expect(groups.map(g => [g.community.title, g.role])).toEqual([['Альфа', 'player'], ['Футбол', 'player']]);
  expect(groups[0].players.map(p => p.displayName)).toEqual(['Игрок', 'Орг Б']);
  expect(groups[1].players.map(p => p.displayName)).toEqual(['Админ', 'Игрок', 'Орг']);
  const ratings = groups.map(g => g.players.find(p => p.userId === w.playerUserId)!.rating.value);
  expect(ratings).toEqual([7, 7]);
  // Profiles are visible only to people who share a group.
  expect((await apiRequest(`/api/players/${orgBUserId}`, { as: w.player })).status).toBe(200);
  expect((await apiRequest(`/api/players/${orgBUserId}`, { as: w.admin })).status).toBe(404);
});

test('kaspi change resyncs open bills in every group', async () => {
  const inA = await billIn(w.communityId, w.playerUserId, [w.orgUserId]);
  const inB = await billIn(b, w.playerUserId, [orgBUserId]);
  w.sync.calls = [];
  expect((await apiRequest('/api/me', { as: w.player, method: 'PATCH', body: { kaspiPhone: '87071234567' } })).status).toBe(200);
  expect(w.sync.calls).toEqual(expect.arrayContaining([
    { eventId: inA.ev.id, req: { parts: ['bill'] } },
    { eventId: inB.ev.id, req: { parts: ['bill'] } },
  ]));
});

/** An open bill in A that can be re-saved; `signupUsers` are on the match. */
async function editableBillInA(signupUsers: number[]) {
  const made = await billIn(w.communityId, w.orgUserId, [w.orgUserId]);
  const ids = (await db().insert(signups).values(signupUsers.map((userId, i) => ({ eventId: made.ev.id, userId, seq: i + 1, createdAt: 0 }))).returning()).map(s => s.id);
  return { ...made, signupIds: ids };
}
const phoneOf = async (userId: number) => (await db().select().from(users).where(eq(users.id, userId)))[0].kaspiPhone;

test('another group cannot overwrite the receiver phone', async () => {
  await db().update(users).set({ kaspiPhone: '+77011111111' }).where(eq(users.id, w.playerUserId));
  const inB = await billIn(b, w.playerUserId, [orgBUserId]);
  const inA = await editableBillInA([w.playerUserId, w.orgUserId]);
  w.sync.calls = [];
  const body = { receiverUserId: w.playerUserId, receiverKaspiPhone: '87022222222', fieldAmount: 4000, extras: [], participantSignupIds: inA.signupIds };
  const r = await apiRequest(`/api/events/${inA.ev.id}/bill`, { as: w.org, method: 'PUT', body });
  expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ error: 'receiver_phone_locked' });
  expect(await phoneOf(w.playerUserId)).toBe('+77011111111');
  expect(w.sync.calls.filter(x => x.eventId === inB.ev.id)).toEqual([]);
  // Same phone, or no phone in the form, keeps working.
  expect((await apiRequest(`/api/events/${inA.ev.id}/bill`, { as: w.org, method: 'PUT', body: { ...body, receiverKaspiPhone: '+7 701 111 11 11' } })).status).toBe(200);
  expect((await apiRequest(`/api/events/${inA.ev.id}/bill`, { as: w.org, method: 'PUT', body: { ...body, receiverKaspiPhone: undefined } })).status).toBe(200);
  expect(w.sync.calls.filter(x => x.eventId === inB.ev.id)).toEqual([]);
});

test('organizer changing own phone in a bill resyncs open bills in every group', async () => {
  await db().update(users).set({ kaspiPhone: '+77011111111' }).where(eq(users.id, w.playerUserId));
  await db().update(memberships).set({ role: 'organizer' }).where(and(eq(memberships.communityId, w.communityId), eq(memberships.userId, w.playerUserId)));
  const inB = await billIn(b, w.playerUserId, [orgBUserId]);
  const inA = await editableBillInA([w.playerUserId, w.orgUserId]);
  w.sync.calls = [];
  const body = { receiverUserId: w.playerUserId, receiverKaspiPhone: '87022222222', fieldAmount: 4000, extras: [], participantSignupIds: inA.signupIds };
  expect((await apiRequest(`/api/events/${inA.ev.id}/bill`, { as: w.player, method: 'PUT', body })).status).toBe(200);
  expect(await phoneOf(w.playerUserId)).toBe('+77022222222');
  expect(w.sync.calls).toContainEqual({ eventId: inB.ev.id, req: { parts: ['bill'] } });
});

test('receiver without a phone gets one from the bill form', async () => {
  const inA = await editableBillInA([w.playerUserId, w.orgUserId]);
  const body = { receiverUserId: w.playerUserId, receiverKaspiPhone: '87022222222', fieldAmount: 4000, extras: [], participantSignupIds: inA.signupIds };
  expect((await apiRequest(`/api/events/${inA.ev.id}/bill`, { as: w.org, method: 'PUT', body })).status).toBe(200);
  expect(await phoneOf(w.playerUserId)).toBe('+77022222222');
});

test('a global account cannot be selected as foreign bill receiver', async () => {
  const outsider = await seedUser('Получатель B', { communityId: b });
  const event = await createEvent(deps(), { communityId: w.communityId, createdBy: w.orgUserId, date: '2026-11-06', comment: null });
  // A direct domain call must also reject another team's receiver.
  const { upsertBill } = await import('../../src/domain/bills');
  await db().update(events).set({ protocolVersion: 0, status: 'scheduled', startTime: '00:00', durationHours: 1 }).where(eq(events.id, event));
  const result = await upsertBill(deps(), event, { receiverUserId: outsider.id, receiverKaspiPhone: '+77011234567', fieldAmount: 1000, extras: [], participantSignupIds: [999] });
  expect(result.kind).toBe('invalid');
});

test('revoked Telegram admin status removes administrative privileges immediately', async () => {
  expect((await (await apiRequest('/api/me', { as: w.admin })).json() as MeDto).communities).toEqual([{ id: w.communityId, title: 'Футбол', role: 'admin' }]);
  w.tg.admins.delete(w.admin.id);
  const r = await apiRequest(`/api/members/${w.playerUserId}?communityId=${w.communityId}`, { as: w.admin, method: 'PATCH', body: { role: 'organizer' } });
  expect(r.status).toBe(403);
  const [m] = await db().select().from(memberships).where(and(eq(memberships.communityId, w.communityId), eq(memberships.userId, w.playerUserId)));
  expect(m.role).toBe('player');
});
