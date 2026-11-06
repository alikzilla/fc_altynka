import { eq } from 'drizzle-orm';
import { bills, events, users } from '../../src/db/schema';
import { addGuest, createEvent, joinEvent, leaveEvent, loadQueue, removeSignup, scheduleEvent, type Deps } from '../../src/domain/events';
import { upsertBill } from '../../src/domain/bills';
import { eventDetail } from '../../src/domain/eventView';
import { FakeSync } from '../fakes/fakeSync';
import { db, seedCommunity, seedUser } from '../helpers';

const start = Date.parse('2026-11-08T15:00:00Z');
let d: Deps;
let id: number;
let org: number;
let player: number;
let communityId: number;
beforeEach(async () => {
  d = { db: db(), now: start - 3600_000, sync: new FakeSync() };
  communityId = (await seedCommunity()).id;
  org = (await seedUser('Орг', { communityId, role: 'organizer' })).id;
  player = (await seedUser('Игрок', { communityId })).id;
  id = await createEvent(d, { communityId, date: '2026-11-08', comment: null, createdBy: org });
});
const schedule = () => scheduleEvent(d, id, { startTime: '20:00', durationHours: 2, place: 'Arena' });
const makeBill = async () => upsertBill(d, id, { receiverUserId: org, receiverKaspiPhone: '+77071234567', fieldAmount: 4000, extras: [], participantSignupIds: (await loadQueue(d.db, id)).main.map(s => s.id) });

test('signup before scheduling is allowed; every queue mutation is frozen exactly at kickoff', async () => {
  expect((await joinEvent(d, id, org)).kind).toBe('main');
  expect((await joinEvent(d, id, player)).kind).toBe('main');
  await schedule();
  const before = await loadQueue(d.db, id);
  d.now = start;
  expect(await joinEvent(d, id, player)).toEqual({ kind: 'closed' });
  expect(await leaveEvent(d, id, player)).toEqual({ kind: 'closed' });
  expect(await addGuest(d, id, player, 'Гость')).toEqual({ kind: 'closed' });
  expect(await removeSignup(d, before.main[0].id, { userId: org, role: 'organizer' })).toBe('closed');
  expect(await loadQueue(d.db, id)).toEqual(before);
});
test('early billing has no side effects; billing becomes available at kickoff', async () => {
  await joinEvent(d, id, org); await joinEvent(d, id, player); await schedule();
  d.now = start - 1;
  expect(await makeBill()).toEqual({ kind: 'not_started' });
  expect(await d.db.select().from(bills)).toHaveLength(0);
  expect((await d.db.select().from(users).where(eq(users.id, org)))[0].kaspiPhone).toBeNull();
  d.now = start;
  expect((await makeBill()).kind).toBe('ok');
});
test('past kickoff and moving an already started match are rejected', async () => {
  d.now = start;
  expect(await schedule()).toBe('past_start');
  d.now = start - 1;
  expect(await schedule()).toBe('ok');
  d.now = start;
  expect(await scheduleEvent(d, id, { startTime: '21:00', durationHours: 2, place: null })).toBe('closed');
});
test('existing legacy bill remains editable even if its stored date is in the future', async () => {
  await joinEvent(d, id, org); await joinEvent(d, id, player); await schedule();
  d.now = start;
  expect((await makeBill()).kind).toBe('ok');
  await d.db.update(events).set({ date: '2027-01-01' }).where(eq(events.id, id));
  expect((await makeBill()).kind).toBe('ok');
});
test('detail reports playing and the injected server clock without changing stored status', async () => {
  await schedule();
  const detail = await eventDetail(d.db, id, { userId: player, role: 'player', communityId }, start);
  expect(detail).toMatchObject({ status: 'playing', serverNow: start });
  expect((await d.db.select().from(events).where(eq(events.id, id)))[0].status).toBe('scheduled');
});
