import { eq } from 'drizzle-orm';
import { apiRequest, db } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';
import { events } from '../../src/db/schema';
import { createEvent, joinEvent } from '../../src/domain/events';
import { saveTeams, publishTeams } from '../../src/domain/teams';
import { FakeSync } from '../fakes/fakeSync';
import { todayAlmaty } from '@altynka/core';

let w: ApiWorld; let eventId: number;
beforeEach(async () => {
  w = await setupApiWorld();
  const d = {db:db(),now:w.clock.now,sync:new FakeSync()};
  eventId = await createEvent(d,{communityId:w.communityId,date:todayAlmaty(new Date(w.clock.now)),createdBy:w.orgUserId,comment:null});
  await joinEvent(d,eventId,w.orgUserId); await joinEvent(d,eventId,w.playerUserId);
  await db().update(events).set({status:'scheduled',startTime:'20:00',durationHours:2}).where(eq(events.id,eventId));
  const { signups } = await import('../../src/db/schema');
  const rows = await db().select().from(signups).where(eq(signups.eventId,eventId));
  await saveTeams(d,eventId,{teamCount:2,teams:rows.map(p => [p.id]),guestLevels:{}}); await publishTeams(d,eventId);
});
afterEach(teardownApiWorld);

test('members read, organizers start; unauthorized writes and foreign events are hidden', async () => {
  expect((await apiRequest(`/api/events/${eventId}/games`,{as:w.player})).status).toBe(200);
  const body = {requestId:'start',expectedRevision:0};
  expect((await apiRequest(`/api/events/${eventId}/games/start`,{as:w.player,method:'POST',body})).status).toBe(403);
  const response = await apiRequest(`/api/events/${eventId}/games/start`,{as:w.org,method:'POST',body});
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({protocol:{state:'playing',currentPair:[0,1]}});
  expect((await apiRequest(`/api/events/999999/games`,{as:w.org})).status).toBe(404);
});
