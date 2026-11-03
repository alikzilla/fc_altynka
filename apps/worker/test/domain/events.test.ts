import { eq } from 'drizzle-orm';
import { events } from '../../src/db/schema';
import {
  addGuest, cancelEvent, createEvent, joinEvent, leaveEvent, loadQueue, promoteSignup, removeSignup, scheduleEvent,
  type Deps,
} from '../../src/domain/events';
import { FakeSync } from '../fakes/fakeSync';
import { db, seedCommunity, seedUser } from '../helpers';

let d: Deps & { sync: FakeSync };
let communityId: number;
let organizerId: number;

beforeEach(async () => {
  d = { db: db(), now: 1_000_000, sync: new FakeSync() };
  communityId = (await seedCommunity()).id;
  organizerId = (await seedUser('Орг', { communityId, role: 'organizer' })).id;
});

const seedEvent = () => createEvent(d, { communityId, date: '2026-11-07', comment: null, createdBy: organizerId });
const seedUsers = (n: number) => Promise.all(Array.from({ length: n }, (_, i) => seedUser(`Игрок${i + 1}`, { communityId })));
const lastReq = () => d.sync.calls.at(-1)!.req;

test('createEvent requests the event message', async () => {
  const ev = await seedEvent();
  expect(d.sync.calls).toEqual([{ eventId: ev, req: { parts: ['event'] } }]);
});

test('11th joiner lands in reserve, positions are 1-based', async () => {
  const ev = await seedEvent();
  const us = await seedUsers(11);
  for (const u of us.slice(0, 10)) expect((await joinEvent(d, ev, u.id)).kind).toBe('main');
  expect(await joinEvent(d, ev, us[10].id)).toEqual({ kind: 'reserve', position: 1, restored: false });
});

test('join twice keeps one signup', async () => {
  const ev = await seedEvent();
  const [u] = await seedUsers(1);
  await joinEvent(d, ev, u.id);
  expect(await joinEvent(d, ev, u.id)).toEqual({ kind: 'already', position: 1, inMain: true });
  expect((await loadQueue(d.db, ev)).main).toHaveLength(1);
});

test('concurrent joins get unique consecutive seqs', async () => {
  const ev = await seedEvent();
  const us = await seedUsers(15);
  await Promise.all(us.map(u => joinEvent(d, ev, u.id)));
  const q = await loadQueue(d.db, ev);
  expect([...q.main, ...q.reserve].map(s => s.seq).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 15 }, (_, i) => i + 1),
  );
});

test('concurrent double tap by the same user keeps one signup', async () => {
  const ev = await seedEvent();
  const [u] = await seedUsers(1);
  const r = await Promise.all([joinEvent(d, ev, u.id), joinEvent(d, ev, u.id)]);
  expect(r.map(x => x.kind).sort()).toEqual(['already', 'main']);
  expect((await loadQueue(d.db, ev)).main).toHaveLength(1);
});

test('leaving main promotes first reservist and emits notice', async () => {
  const ev = await seedEvent();
  const us = await seedUsers(11);
  for (const u of us) await joinEvent(d, ev, u.id);
  expect(await leaveEvent(d, ev, us[0].id)).toEqual({ kind: 'left' });
  const q = await loadQueue(d.db, ev);
  expect(q.main.map(s => s.userId)).toContain(us[10].id);
  expect(lastReq().notices).toEqual([{ kind: 'promoted', signupIds: [q.main.at(-1)!.id] }]);
});

test('leave when not signed up', async () => {
  const ev = await seedEvent();
  const [u] = await seedUsers(1);
  expect(await leaveEvent(d, ev, u.id)).toEqual({ kind: 'not_in' });
});

test('rejoin within 2 minutes restores the old place, later goes to the end', async () => {
  const ev = await seedEvent();
  const us = await seedUsers(3);
  for (const u of us) await joinEvent(d, ev, u.id);
  await leaveEvent(d, ev, us[0].id);
  expect(await joinEvent({ ...d, now: d.now + 60_000 }, ev, us[0].id)).toEqual({ kind: 'main', position: 1, restored: true });
  await leaveEvent({ ...d, now: d.now + 70_000 }, ev, us[0].id);
  expect(await joinEvent({ ...d, now: d.now + 300_000 }, ev, us[0].id)).toEqual({ kind: 'main', position: 3, restored: false });
});

test('schedule 2h promotes 11-15 in one notice; back to 1h demotes them', async () => {
  const ev = await seedEvent();
  const us = await seedUsers(16);
  for (const u of us) await joinEvent(d, ev, u.id);
  expect(await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 2, place: 'Шанырак' })).toBe('ok');
  const n = lastReq().notices!;
  expect(n).toContainEqual({ kind: 'scheduled' });
  expect(n.find(x => x.kind === 'promoted')).toMatchObject({ signupIds: expect.any(Array) });
  expect((n.find(x => x.kind === 'promoted') as { signupIds: number[] }).signupIds).toHaveLength(5);
  expect((await loadQueue(d.db, ev)).main).toHaveLength(15);
  const [row] = await d.db.select().from(events).where(eq(events.id, ev));
  expect(row).toMatchObject({ status: 'scheduled', startTime: '21:00', durationHours: 2, place: 'Шанырак', baseLimit: 15 });
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: 'Шанырак' });
  expect((lastReq().notices!.find(x => x.kind === 'demoted') as { signupIds: number[] }).signupIds).toHaveLength(5);
});

test('manual promotion adds a seat', async () => {
  const ev = await seedEvent();
  const us = await seedUsers(11);
  for (const u of us) await joinEvent(d, ev, u.id);
  const reservist = (await loadQueue(d.db, ev)).reserve[0];
  expect(await promoteSignup(d, reservist.id)).toBe('ok');
  const q = await loadQueue(d.db, ev);
  expect(q.main).toHaveLength(11);
  expect(q.reserve).toHaveLength(0);
  expect(lastReq().notices).toEqual([{ kind: 'promoted', signupIds: [reservist.id] }]);
  expect(await promoteSignup(d, q.main[0].id)).toBe('not_reserve');
});

test('guest queues like a player; inviter or organizer can remove, others cannot', async () => {
  const ev = await seedEvent();
  const [inviter, stranger] = await seedUsers(2);
  await joinEvent(d, ev, inviter.id);
  const g = await addGuest(d, ev, inviter.id, 'Ержан');
  expect(g).toMatchObject({ kind: 'main', position: 2 });
  const gid = (g as { signupId: number }).signupId;
  expect(await removeSignup(d, gid, { userId: stranger.id, role: 'player' })).toBe('forbidden');
  expect(await removeSignup(d, gid, { userId: inviter.id, role: 'player' })).toBe('ok');
  const g2 = (await addGuest(d, ev, inviter.id, 'Ержан')) as { signupId: number };
  expect(await removeSignup(d, g2.signupId, { userId: organizerId, role: 'organizer' })).toBe('ok');
});

test('player cannot remove another player, organizer can', async () => {
  const ev = await seedEvent();
  const [a, b] = await seedUsers(2);
  await joinEvent(d, ev, a.id);
  const sid = (await loadQueue(d.db, ev)).main[0].id;
  expect(await removeSignup(d, sid, { userId: b.id, role: 'player' })).toBe('forbidden');
  expect(await removeSignup(d, sid, { userId: organizerId, role: 'organizer' })).toBe('ok');
  expect((await loadQueue(d.db, ev)).main).toHaveLength(0);
});

test('list is frozen once status is billing', async () => {
  const ev = await seedEvent();
  const [a, b] = await seedUsers(2);
  await joinEvent(d, ev, a.id);
  await d.db.update(events).set({ status: 'billing' }).where(eq(events.id, ev));
  expect(await joinEvent(d, ev, b.id)).toEqual({ kind: 'closed' });
  expect(await leaveEvent(d, ev, a.id)).toEqual({ kind: 'closed' });
  expect(await addGuest(d, ev, a.id, 'Гость')).toEqual({ kind: 'closed' });
});

test('cancel emits cancelled notice', async () => {
  const ev = await seedEvent();
  expect(await cancelEvent(d, ev)).toBe('ok');
  expect(lastReq()).toEqual({ parts: ['event'], notices: [{ kind: 'cancelled' }] });
  expect(await cancelEvent(d, ev)).toBe('closed');
  expect(await joinEvent(d, 9999, organizerId)).toEqual({ kind: 'not_found' });
});

test('the same guest added twice by one inviter is kept once, even on a double tap', async () => {
  const ev = await seedEvent();
  const [inviter, other] = await seedUsers(2);
  expect(await addGuest(d, ev, inviter.id, 'Ержан')).toMatchObject({ kind: 'main' });
  expect(await addGuest(d, ev, inviter.id, 'Ержан')).toEqual({ kind: 'duplicate' });
  const both = await Promise.all([addGuest(d, ev, inviter.id, 'Асет'), addGuest(d, ev, inviter.id, 'Асет')]);
  expect(both.filter(r => r.kind === 'duplicate')).toHaveLength(1);
  expect(await addGuest(d, ev, other.id, 'Ержан')).toMatchObject({ kind: 'main' });
  expect((await loadQueue(d.db, ev)).main.map(s => s.guestName)).toEqual(['Ержан', 'Асет', 'Ержан']);
});
