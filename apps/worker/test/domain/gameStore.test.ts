import type { GameState } from '@altynka/core';
import { db, seedCommunity, seedUser } from '../helpers';
import { events } from '../../src/db/schema';
import { getEvent, type Deps } from '../../src/domain/events';
import { commitGameCommand, loadGameState } from '../../src/domain/gameStore';
import { FakeSync } from '../fakes/fakeSync';

test('CAS serializes commands and recognizes old receipts after later mutations', async () => {
  const c = await seedCommunity(); const u = await seedUser('Org', { communityId: c.id });
  const [ev] = await db().insert(events).values({ communityId: c.id, date: '2026-11-06', status: 'scheduled', createdBy: u.id, createdAt: 0, protocolVersion: 1 }).returning();
  const d: Deps = { db: db(), now: 100, sync: new FakeSync() };
  const state: GameState = { teamCount: 2, roster: [], initialPair: [0,1], currentPair: [0,1], games: [], receipts: [], finishParticipants: null };
  const first = { fingerprint: 'start', state, startedAt: 100, completedAt: null };
  const results = await Promise.all(['one','two'].map(requestId => commitGameCommand(d, ev, { requestId, expectedRevision: 0 }, first)));
  expect(results.filter(r => r.kind === 'ok')).toHaveLength(1);
  const current = (await getEvent(db(),ev.id))!;
  const accepted = (await loadGameState(db(),ev.id))!.receipts[0].requestId;
  expect(await commitGameCommand(d,current,{requestId:'later',expectedRevision:1},{...first,fingerprint:'later',state:(await loadGameState(db(),ev.id))!})).toMatchObject({kind:'ok',appliedRevision:2});
  expect(await commitGameCommand(d,ev,{requestId:accepted,expectedRevision:0},first)).toMatchObject({kind:'ok',appliedRevision:1,duplicate:true});
  expect(await commitGameCommand(d,ev,{requestId:accepted,expectedRevision:0},{...first,fingerprint:'changed'})).toEqual({kind:'conflict'});
  expect((await getEvent(db(),ev.id))!.gameRevision).toBe(2);
});
