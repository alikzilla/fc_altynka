import { eq } from 'drizzle-orm';
import { events, signups, teamAssignments, users } from '../../src/db/schema';
import { addGuest, getEvent, joinEvent, leaveEvent, removeSignup, scheduleEvent } from '../../src/domain/events';
import { publishTeams, saveTeams } from '../../src/domain/teams';
import { startGameSession, getGameProtocol } from '../../src/domain/gameStart';
import { commitGameCommand } from '../../src/domain/gameStore';
import { gameFixture } from './gameFixture';

test('manual start freezes identity and lineups, repeats never redraw', async () => {
  const w = await gameFixture();
  const r = await startGameSession(w.d,w.eventId,w.actorId,{requestId:'start',expectedRevision:0});
  expect(r.kind).toBe('ok'); if (r.kind !== 'ok') return;
  expect(r.protocol).toMatchObject({state:'playing',revision:1,canStart:false,canRecord:true});
  expect(r.protocol.roster.find(p => p.userId === null)?.name).toBe('Гость');
  await w.d.db.update(users).set({displayName:'Новое имя'}).where(eq(users.id,w.actorId));
  expect((await getGameProtocol(w.d,w.eventId,false))?.roster[0].name).toBe('Игрок 0');
  expect((await getGameProtocol(w.d,w.eventId,false))?.canRecord).toBe(false);
  const again = await startGameSession(w.d,w.eventId,w.actorId,{requestId:'start-again',expectedRevision:0});
  expect(again).toMatchObject({kind:'ok',protocol:{currentPair:r.protocol.currentPair,startedAt:r.protocol.startedAt}});
  expect(await joinEvent(w.d,w.eventId,w.actorId)).toEqual({kind:'closed'});
  expect(await leaveEvent(w.d,w.eventId,w.actorId)).toEqual({kind:'closed'});
  expect(await addGuest(w.d,w.eventId,w.actorId,'Late')).toEqual({kind:'closed'});
  expect(await removeSignup(w.d,w.ids[0],{userId:w.actorId,role:'organizer'})).toBe('closed');
  expect(await saveTeams(w.d,w.eventId,{teamCount:3,teams:w.teams,guestLevels:{}})).toBe('closed');
  expect(await publishTeams(w.d,w.eventId)).toBe('closed');
  expect(await scheduleEvent(w.d,w.eventId,{startTime:'21:00',durationHours:2,place:null})).toBe('closed');
});

test.each(['collecting','cancelled','legacy','future','unpublished','stale','empty'] as const)('start rejects %s preparation', async kind => {
  const w = await gameFixture();
  if (kind === 'collecting' || kind === 'cancelled') await w.d.db.update(events).set({status:kind}).where(eq(events.id,w.eventId));
  if (kind === 'legacy') await w.d.db.update(events).set({protocolVersion:0}).where(eq(events.id,w.eventId));
  if (kind === 'future') w.d.now -= 86400_000;
  if (kind === 'unpublished') await w.d.db.update(events).set({teamsPublishedAt:null}).where(eq(events.id,w.eventId));
  if (kind === 'stale') await removeSignup(w.d,w.ids.at(-1)!,{userId:w.actorId,role:'organizer'});
  if (kind === 'empty') await w.d.db.delete(teamAssignments).where(eq(teamAssignments.eventId,w.eventId));
  expect((await startGameSession(w.d,w.eventId,w.actorId,{requestId:'start',expectedRevision:0})).kind).not.toBe('ok');
  expect((await getEvent(w.d.db,w.eventId))?.startedAt).toBeNull();
});

test('scheduled time alone does not lock preparation', async () => {
  const w = await gameFixture(); w.d.now += 7200_000;
  expect(await saveTeams(w.d,w.eventId,{teamCount:3,teams:w.teams,guestLevels:{}})).toBe('ok');
  expect(await publishTeams(w.d,w.eventId)).toBe('ok');
  expect((await startGameSession(w.d,w.eventId,w.actorId,{requestId:'late',expectedRevision:0})).kind).toBe('ok');
});

test('stale roster revision prevents a snapshot committing after guest removal; guards roll back partial batches', async () => {
  const w = await gameFixture();
  const before = (await getEvent(w.d.db,w.eventId))!;
  await removeSignup(w.d,w.ids.at(-1)!,{userId:w.actorId,role:'organizer'});
  const state = {teamCount:3 as const,roster:[],initialPair:[0,1] as const,currentPair:[0,1] as const,games:[],receipts:[],finishParticipants:null};
  expect(await commitGameCommand(w.d,before,{requestId:'stale',expectedRevision:0},{fingerprint:'start',state,startedAt:w.d.now,completedAt:null})).toEqual({kind:'conflict'});
  await saveTeams(w.d,w.eventId,{teamCount:3,teams:[w.ids.slice(0,2),w.ids.slice(2,4),w.ids.slice(4,5)],guestLevels:{}}); await publishTeams(w.d,w.eventId);
  await startGameSession(w.d,w.eventId,w.actorId,{requestId:'start',expectedRevision:0});
  await expect(w.d.db.batch([w.d.db.delete(teamAssignments).where(eq(teamAssignments.eventId,w.eventId)),w.d.db.delete(signups).where(eq(signups.id,w.ids[0]))])).rejects.toThrow();
  expect(await w.d.db.select().from(teamAssignments).where(eq(teamAssignments.eventId,w.eventId))).toHaveLength(5);
});
