import { eq } from 'drizzle-orm';
import { bills, events, users, type UserRow } from '../../src/db/schema';
import { billDto, closeBill, markPaid, remindDebtors, setLinePaid, upsertBill } from '../../src/domain/bills';
import { addGuest, createEvent, joinEvent, loadQueue, scheduleEvent, type Deps } from '../../src/domain/events';
import { FakeSync } from '../fakes/fakeSync';
import { setMemberProfile, localUser, db, seedCommunity, seedUser } from '../helpers';

let d: Deps & { sync: FakeSync };
let ev: number;
let us: UserRow[];
let timur: UserRow;
let signupIds: number[];
let orgId: number;

beforeEach(async () => {
  d = { db: db(), now: 7_000, sync: new FakeSync() };
  const c = await seedCommunity();
  const org = await seedUser('Орг', { communityId: c.id, role: 'organizer' });
  orgId = org.id;
  ev = await createEvent(d, { communityId: c.id, date: '2026-11-07', comment: null, createdBy: org.id });
  // Legacy appointment fixture; manual sessions are covered by gameFinish tests.
  await d.db.update(events).set({protocolVersion:0}).where(eq(events.id,ev));
  us = await Promise.all(Array.from({ length: 9 }, (_, i) => seedUser(`И${i + 1}`, { communityId: c.id })));
  timur = us[8];
  for (const u of us) await joinEvent(d, ev, u.id);
  await addGuest(d, ev, timur.id, 'Ержан');
  await setMemberProfile(us[0].id, { kaspiPhone: '+77071234567' });
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: 'Arena' });
  d.now = Date.parse('2026-11-07T16:00:00Z');
  signupIds = (await loadQueue(d.db, ev)).main.map(s => s.id);
});

const make = (o: Partial<Parameters<typeof upsertBill>[2]> = {}) =>
  upsertBill(d, ev, {
    receiverUserId: us[0].id, fieldAmount: 20000, extras: [{ label: 'Вода', amount: 1500 }], participantSignupIds: signupIds, ...o,
  });
const billIdOf = async () => (await d.db.select().from(bills).where(eq(bills.eventId, ev)))[0].id;

test('saving a receiver phone during billing also persists completed profile setup', async () => {
  expect((await localUser(us[0].id)).profileCompletedAt).toBeNull();
  expect((await make({ receiverKaspiPhone: '8 707 123 45 67' })).kind).toBe('ok');
  expect((await localUser(us[0].id))).toMatchObject({ kaspiPhone: '+77071234567', profileCompletedAt: d.now });
});

test('bill splits equally, guest share goes to inviter, receiver is pre-paid', async () => {
  const r = await make();
  expect(r.kind).toBe('ok');
  const b = await billDto(d.db, (r as { billId: number }).billId);
  expect(b).toMatchObject({ total: 21500, share: 2150, status: 'open', receiver: { userId: us[0].id, kaspiPhone: '+77071234567' } });
  expect(b.lines.find(l => l.userId === timur.id)).toMatchObject({ units: 2, amount: 4300, state: 'unpaid' });
  expect(b.lines.find(l => l.userId === us[0].id)).toMatchObject({ state: 'paid', due: 0 });
  expect(b.lines).toHaveLength(9);
  expect((await d.db.select().from(events).where(eq(events.id, ev)))[0].status).toBe('billing');
  expect(d.sync.calls.at(-1)!.req.parts).toEqual(['bill', 'event']);
});

test('missing Kaspi phone → no_kaspi; junk → bad_phone; valid phone saved to receiver profile', async () => {
  expect(await make({ receiverUserId: us[1].id })).toEqual({ kind: 'no_kaspi' });
  expect(await make({ receiverUserId: us[1].id, receiverKaspiPhone: 'abc' })).toEqual({ kind: 'bad_phone' });
  expect((await make({ receiverUserId: us[1].id, receiverKaspiPhone: '8 707 000 11 22' })).kind).toBe('ok');
  expect((await localUser(us[1].id)).kaspiPhone).toBe('+77070001122');
});

test('participants must be signups of this event', async () => {
  expect(await make({ participantSignupIds: [] })).toEqual({ kind: 'invalid' });
  expect(await make({ participantSignupIds: [999999] })).toEqual({ kind: 'invalid' });
});

test('markPaid twice is idempotent', async () => {
  const billId = ((await make()) as { billId: number }).billId;
  expect(await markPaid(d, billId, us[1].id, us[1].id)).toBe('ok');
  expect(await markPaid(d, billId, us[1].id, us[1].id)).toBe('already');
  expect(await markPaid(d, billId, 424242, 424242)).toBe('not_in_bill');
  expect((await billDto(d.db, billId)).lines.find(l => l.userId === us[1].id)).toMatchObject({ paidAmount: 2150, state: 'paid' });
});

test('raising the amount turns paid lines into underpaid with due', async () => {
  const billId = ((await make()) as { billId: number }).billId;
  await markPaid(d, billId, us[1].id, us[1].id);
  await make({ fieldAmount: 25000 });
  expect(await billIdOf()).toBe(billId);
  const b = await billDto(d.db, billId);
  expect(b.share).toBe(2650);
  expect(b.lines.find(l => l.userId === us[1].id)).toMatchObject({ state: 'underpaid', due: 500 });
  expect(b.lines.find(l => l.userId === us[0].id)).toMatchObject({ state: 'paid' });
});

test('last payment closes bill and event', async () => {
  const billId = ((await make()) as { billId: number }).billId;
  for (const u of us.slice(1)) await markPaid(d, billId, u.id, u.id);
  expect((await billDto(d.db, billId)).status).toBe('closed');
  expect((await d.db.select().from(events).where(eq(events.id, ev)))[0].status).toBe('closed');
  expect(await markPaid(d, billId, us[1].id, us[1].id)).toBe('closed');
});

test('only organizer or receiver can toggle a line', async () => {
  const billId = ((await make()) as { billId: number }).billId;
  const line = (await billDto(d.db, billId)).lines.find(l => l.userId === us[2].id)!;
  expect(await setLinePaid(d, line.id, true, { userId: us[3].id, role: 'player' })).toBe('forbidden');
  expect(await setLinePaid(d, line.id, true, { userId: us[0].id, role: 'player' })).toBe('ok');
  expect(await setLinePaid(d, line.id, false, { userId: orgId, role: 'organizer' })).toBe('ok');
  expect((await billDto(d.db, billId)).lines.find(l => l.id === line.id)!.state).toBe('unpaid');
});

test('remind emits a reminder notice, nobody when all paid; close closes', async () => {
  const billId = ((await make()) as { billId: number }).billId;
  expect(await remindDebtors(d, billId)).toBe('ok');
  expect(d.sync.calls.at(-1)!.req).toEqual({ parts: [], notices: [{ kind: 'reminder', billId }] });
  expect(await closeBill(d, billId)).toBe('ok');
  expect((await billDto(d.db, billId)).status).toBe('closed');
  for (const u of us.slice(1)) await setLinePaid(d, (await billDto(d.db, billId)).lines.find(l => l.userId === u.id)!.id, true, { userId: orgId, role: 'admin' });
  expect(await remindDebtors(d, billId)).toBe('nobody');
});
