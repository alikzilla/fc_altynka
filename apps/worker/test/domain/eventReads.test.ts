import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { eventDetail } from '../../src/domain/eventView';
import { addGuest, getEvent } from '../../src/domain/events';
import { getGameProtocol, startGameSession } from '../../src/domain/gameStart';
import { finishGameSession } from '../../src/domain/games';
import { billDto, getBillByEvent, upsertBill } from '../../src/domain/bills';
import { teamsDto } from '../../src/domain/teams';
import { gameFixture } from './gameFixture';
import { seedUser, setMemberProfile } from '../helpers';

function trackedDb() {
  const queries: string[] = [];
  const db = drizzle(env.DB, { schema, logger: { logQuery(query) { queries.push(query); } } });
  return { db, queries };
}

async function fixture(phase: 'scheduled' | 'playing' | 'finished' | 'legacy') {
  const w = await gameFixture(2);
  if (phase === 'scheduled') return w;
  if (phase === 'legacy') {
    await w.d.db.update(schema.events).set({ protocolVersion: 0 }).where(eq(schema.events.id, w.eventId));
    w.d.now += 2 * 3600_000;
  } else {
    const started = await startGameSession(w.d, w.eventId, w.actorId, { requestId: 'start', expectedRevision: 0 });
    expect(started.kind).toBe('ok');
  }
  const bill = await upsertBill(w.d, w.eventId, {
    receiverUserId: w.actorId, receiverKaspiPhone: '+77071234567',
    fieldAmount: 12000, extras: [], participantSignupIds: w.ids,
  });
  expect(bill.kind).toBe('ok');
  if (phase === 'finished') {
    const finished = await finishGameSession(w.d, w.eventId, w.actorId,
      { requestId: 'finish', expectedRevision: 1 }, w.ids);
    expect(finished.kind).toBe('ok');
  }
  return w;
}

test.each(['scheduled', 'playing', 'finished', 'legacy'] as const)(
  '%s detail loads the complete event once and preserves standalone DTOs', async phase => {
    const w = await fixture(phase);
    const ev = (await getEvent(w.d.db, w.eventId))!;
    const bill = await getBillByEvent(w.d.db, w.eventId);
    const expectedTeams = await teamsDto(w.d.db, w.eventId, w.ids);
    const expectedBill = bill ? await billDto(w.d.db, bill.id) : null;
    for (const role of ['organizer', 'player'] as const) {
      const expectedProtocol = await getGameProtocol(w.d, w.eventId, role === 'organizer');
      const tracked = trackedDb();
      const detail = await eventDetail(tracked.db, w.eventId,
        { userId: w.actorId, role, community: w.community }, w.d.now);
      expect(detail).toMatchObject({ id: w.eventId, date: ev.date, mainCount: 6, reserveCount: 0 });
      expect(detail?.gameProtocol).toEqual(expectedProtocol);
      expect(detail?.teams).toEqual(expectedTeams);
      expect(detail?.bill).toEqual(expectedBill);
      expect(detail?.main.every(p => role === 'organizer' ? p.level !== undefined : p.level === undefined && p.kaspiPhone === undefined)).toBe(true);
      expect(tracked.queries.filter(q => q.startsWith('select ') && q.includes('from "events"') && q.includes('"game_state_json"'))).toHaveLength(1);
      expect(tracked.queries.filter(q => q.includes('from "team_assignments"'))).toHaveLength(1);
    }
  },
);

test('a later detail reads fresh roster, publication state and receiver phone', async () => {
  const w = await fixture('playing');
  const tracked = trackedDb();
  const viewer = { userId: w.actorId, role: 'organizer' as const, community: w.community };
  const first = await eventDetail(tracked.db, w.eventId, viewer, w.d.now);
  expect(first?.bill?.receiver.kaspiPhone).toBe('+77071234567');
  await w.d.db.update(schema.users).set({ displayName: 'Новое имя', kaspiPhone: '+77077654321' }).where(eq(schema.users.id, w.actorId));
  const second = await eventDetail(tracked.db, w.eventId, viewer, w.d.now + 1);
  expect(second?.main.find(p => p.userId === w.actorId)?.name).toBe('Новое имя');
  expect(second?.bill?.receiver).toMatchObject({ name: 'Новое имя', kaspiPhone: '+77077654321' });
});

test('missing and foreign matches do not load dependent detail data', async () => {
  const w = await fixture('scheduled');
  const tracked = trackedDb();
  expect(await eventDetail(tracked.db, w.eventId, { userId: w.actorId, role: 'organizer', community: { ...w.community, id: w.community.id + 1 } }, w.d.now)).toBeNull();
  expect(await eventDetail(tracked.db, 999999, { userId: w.actorId, role: 'organizer', community: w.community }, w.d.now)).toBeNull();
  expect(tracked.queries).toHaveLength(2);
});

test.each(['organizer', 'player'] as const)('%s detail reuses participant users for ratings and billing', async role => {
  const w = await fixture('playing');
  const tracked = trackedDb();
  const detail = await eventDetail(tracked.db, w.eventId, { userId: w.actorId, role, community: w.community }, w.d.now);
  expect(detail?.bill?.receiver.userId).toBe(w.actorId);
  expect(detail?.main).toHaveLength(6);
  expect(tracked.queries.filter(q => q.includes('from "users"'))).toHaveLength(1);
});

test('billing loads a receiver outside the playing roster and sees their later changes', async () => {
  const w = await fixture('playing');
  const receiver = await seedUser('Кассир', { communityId: w.community.id });
  await setMemberProfile(receiver.id, { kaspiPhone: '+77070000001' });
  expect((await upsertBill(w.d, w.eventId, { receiverUserId: receiver.id, fieldAmount: 12000, extras: [], participantSignupIds: w.ids })).kind).toBe('ok');
  const tracked = trackedDb();
  const viewer = { userId: w.actorId, role: 'organizer' as const, community: w.community };
  const first = await eventDetail(tracked.db, w.eventId, viewer, w.d.now);
  expect(first?.bill?.receiver).toMatchObject({ userId: receiver.id, name: 'Кассир', kaspiPhone: '+77070000001' });
  expect(tracked.queries.filter(q => q.includes('from "users"'))).toHaveLength(2);
  await setMemberProfile(receiver.id, { displayName: 'Новый кассир', kaspiPhone: '+77070000002' });
  const second = await eventDetail(tracked.db, w.eventId, viewer, w.d.now + 1);
  expect(second?.bill?.receiver).toMatchObject({ name: 'Новый кассир', kaspiPhone: '+77070000002' });
});

test('prepared teams become stale after the queue changes and a later detail cannot start', async () => {
  const w = await fixture('scheduled');
  const tracked = trackedDb();
  const viewer = { userId: w.actorId, role: 'organizer' as const, community: w.community };
  expect((await eventDetail(tracked.db, w.eventId, viewer, w.d.now))?.gameProtocol?.canStart).toBe(true);
  expect((await addGuest(w.d, w.eventId, w.actorId, 'Ещё гость')).kind).toBe('main');
  const second = await eventDetail(tracked.db, w.eventId, viewer, w.d.now + 1);
  expect(second?.teams?.stale).toBe(true);
  expect(second?.gameProtocol?.canStart).toBe(false);
});
