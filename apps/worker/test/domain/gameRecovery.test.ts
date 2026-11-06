import { eq } from 'drizzle-orm';
import { createScheduledController, env, runInDurableObject } from 'cloudflare:test';
import worker from '../../src/index';
import { events, matchReviews } from '../../src/db/schema';
import { startGameSession } from '../../src/domain/gameStart';
import { finishGameSession } from '../../src/domain/games';
import { recoverPendingGameReviews } from '../../src/domain/gameRecovery';
import { getEvent } from '../../src/domain/events';
import { FakeSync } from '../fakes/fakeSync';
import { gameFixture } from './gameFixture';

test.each(['sync','review'] as const)('scheduled recovery completes an abandoned finish after %s failed before enqueue',async failure=>{
  const w=await gameFixture();await startGameSession(w.d,w.eventId,w.actorId,{requestId:'start',expectedRevision:0});
  const failedSync={request:vi.fn().mockRejectedValue(new Error('enqueue failed'))};
  const spy=failure==='review'?vi.spyOn(w.d.db,'run').mockRejectedValueOnce(new Error('review failed')):null;
  await expect(finishGameSession({...w.d,sync:failedSync},w.eventId,w.actorId,{requestId:'finish',expectedRevision:1},w.ids)).rejects.toThrow();
  spy?.mockRestore();
  const completed=(await getEvent(w.d.db,w.eventId))!;expect(completed.completedAt).not.toBeNull();expect(completed.reviewSyncPending).toBe(true);
  if(failure==='sync')expect(await w.d.db.select().from(matchReviews).where(eq(matchReviews.eventId,w.eventId))).toHaveLength(1);
  // No client retry: a later scheduled invocation discovers the durable pending row.
  const sync=new FakeSync();expect(await recoverPendingGameReviews({...w.d,sync})).toEqual({recovered:1,failed:0});
  expect((await getEvent(w.d.db,w.eventId))?.reviewSyncPending).toBe(false);
  expect(await w.d.db.select().from(matchReviews).where(eq(matchReviews.eventId,w.eventId))).toHaveLength(1);
  expect(sync.calls).toEqual([{eventId:w.eventId,req:{parts:['event'],review:true}}]);
  expect(await recoverPendingGameReviews({...w.d,sync})).toEqual({recovered:0,failed:0});
});

test('the real scheduled handler arms the Durable Object review notification and clears the outbox',async()=>{
  const w=await gameFixture();await startGameSession(w.d,w.eventId,w.actorId,{requestId:'start',expectedRevision:0});
  await expect(finishGameSession({...w.d,sync:{request:async()=>{throw new Error('RPC lost');}}},w.eventId,w.actorId,{requestId:'finish',expectedRevision:1},w.ids)).rejects.toThrow('RPC lost');
  await worker.scheduled(createScheduledController({cron:'*/5 * * * *'}),env);
  expect((await getEvent(w.d.db,w.eventId))?.reviewSyncPending).toBe(false);
  const stub=env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${w.eventId}`));
  expect(await runInDurableObject(stub,(_instance,state)=>state.storage.get('auto:reviewArmed'))).toBe(true);
});
