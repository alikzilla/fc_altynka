import { eq } from 'drizzle-orm';
import { events, matchReviews } from '../../src/db/schema';
import { getEvent } from '../../src/domain/events';
import { startGameSession } from '../../src/domain/gameStart';
import { recordGameResult, finishGameSession } from '../../src/domain/games';
import { closeBill, upsertBill } from '../../src/domain/bills';
import { eventDetail, listEvents, matchArchive } from '../../src/domain/eventView';
import { commitGameCommand, parseGameState } from '../../src/domain/gameStore';
import { ensureGameReview } from '../../src/domain/ratings';
import { gameFixture } from './gameFixture';

test('billing before manual start is rejected, closed payment does not finish sport or hide it from active', async () => {
  const w=await gameFixture(2);
  const billInput={receiverUserId:w.actorId,receiverKaspiPhone:'+77071234567',fieldAmount:12000,extras:[],participantSignupIds:w.ids};
  w.d.now+=7200_000;
  expect((await upsertBill(w.d,w.eventId,billInput)).kind).toBe('not_started');
  await startGameSession(w.d,w.eventId,w.actorId,{requestId:'start',expectedRevision:0});
  const bill=await upsertBill(w.d,w.eventId,billInput); if(bill.kind!=='ok') throw new Error(bill.kind);
  const beforeClose=(await getEvent(w.d.db,w.eventId))!;
  await closeBill(w.d,bill.billId);
  const staleFinish=await commitGameCommand(w.d,beforeClose,{requestId:'stale-finish',expectedRevision:1},{fingerprint:'finish',state:parseGameState(beforeClose)!,startedAt:beforeClose.startedAt,completedAt:w.d.now,status:'billing'});
  expect(staleFinish.kind).toBe('conflict');
  const list=await listEvents(w.d.db,[w.community],w.actorId,w.d.now);
  expect(list.active).toContainEqual(expect.objectContaining({id:w.eventId,status:'playing'}));
  expect((await matchArchive(w.d.db,[w.community],w.actorId,null,w.d.now)).events).toHaveLength(0);
  expect((await recordGameResult(w.d,w.eventId,w.actorId,{requestId:'game',expectedRevision:1},{score:[1,0],scorers:[]})).kind).toBe('ok');
  expect((await finishGameSession(w.d,w.eventId,w.actorId,{requestId:'finish',expectedRevision:2},w.ids)).kind).toBe('ok');
  const detail=await eventDetail(w.d.db,w.eventId,{userId:w.actorId,role:'organizer',community:w.community},w.d.now);
  expect(detail).toMatchObject({status:'closed',gameProtocol:{state:'completed'},review:{state:'open',canFinish:false}});
  expect((await matchArchive(w.d.db,[w.community],w.actorId,null,w.d.now)).events).toHaveLength(1);
});

test.each([true,false])('finish with no recorded games and empty participants=%s is idempotent and review-aware', async empty => {
  const w=await gameFixture();
  expect((await finishGameSession(w.d,w.eventId,w.actorId,{requestId:'finish',expectedRevision:0},[])).kind).toBe('not_started');
  await startGameSession(w.d,w.eventId,w.actorId,{requestId:'start',expectedRevision:0});
  const ids=empty?[]:w.ids;
  const first=await finishGameSession(w.d,w.eventId,w.actorId,{requestId:'finish',expectedRevision:1},ids);
  if(first.kind!=='ok') throw new Error(first.kind);
  const completedAt=first.protocol.completedAt;
  w.d.now+=10000;
  expect(await finishGameSession(w.d,w.eventId,w.actorId,{requestId:'finish',expectedRevision:1},ids)).toMatchObject({kind:'ok',protocol:{completedAt}});
  await ensureGameReview(w.d,w.eventId);
  const reviews=await w.d.db.select().from(matchReviews).where(eq(matchReviews.eventId,w.eventId));
  expect(reviews).toHaveLength(empty?0:1);
  if(!empty) expect(reviews[0].completedAt).toBe(completedAt);
  const detail=await eventDetail(w.d.db,w.eventId,{userId:w.actorId,role:'organizer',community:w.community},w.d.now);
  expect(detail?.review?.state).toBe(empty?'ineligible':'open');
});

test('played protocol cannot finish with nobody, open bill stays open after sport completes', async () => {
  const w=await gameFixture(2); await startGameSession(w.d,w.eventId,w.actorId,{requestId:'start',expectedRevision:0});
  await recordGameResult(w.d,w.eventId,w.actorId,{requestId:'record',expectedRevision:1},{score:[0,0],scorers:[]});
  expect((await finishGameSession(w.d,w.eventId,w.actorId,{requestId:'invalid',expectedRevision:2},[])).kind).toBe('invalid');
  expect((await upsertBill(w.d,w.eventId,{receiverUserId:w.actorId,receiverKaspiPhone:'+77071234567',fieldAmount:12000,extras:[],participantSignupIds:w.ids})).kind).toBe('ok');
  expect((await finishGameSession(w.d,w.eventId,w.actorId,{requestId:'finish',expectedRevision:2},w.ids)).kind).toBe('ok');
  expect((await getEvent(w.d.db,w.eventId))?.status).toBe('billing');
});
