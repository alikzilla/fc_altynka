import { eq } from 'drizzle-orm';
import type { GameProtocolDto, GameResultInput } from '@altynka/core';
import { events } from '../../src/db/schema';
import { getGameProtocol, startGameSession } from '../../src/domain/gameStart';
import { recordGameResult, editGameResult, undoLastGame } from '../../src/domain/games';
import { gameFixture } from './gameFixture';

let w: Awaited<ReturnType<typeof gameFixture>>; let protocol: GameProtocolDto;
beforeEach(async () => {
  w = await gameFixture();
  const r = await startGameSession(w.d,w.eventId,w.actorId,{requestId:'start',expectedRevision:0});
  if (r.kind !== 'ok') throw new Error(r.kind); protocol = r.protocol;
});
const record = (input: GameResultInput, requestId = 'record', expectedRevision = protocol.revision) => recordGameResult(w.d,w.eventId,w.actorId,{requestId,expectedRevision},input);

test('first sulifa is required only on the first draw; next games rotate independently of outcomes', async () => {
  expect((await record({score:[0,0],scorers:[]})).kind).toBe('invalid');
  const pair = protocol.currentPair!;
  expect((await record({score:[0,0],scorers:[],firstRestTeamIndex:[0,1,2].find(t=>!pair.includes(t))!})).kind).toBe('invalid');
  const first = await record({score:[0,0],scorers:[],firstRestTeamIndex:pair[0]});
  expect(first.kind).toBe('ok'); if (first.kind !== 'ok') return;
  expect(first.protocol.currentPair).not.toContain(pair[0]);
  const second = await recordGameResult(w.d,w.eventId,w.actorId,{requestId:'second',expectedRevision:first.protocol.revision},{score:[0,0],scorers:[]});
  expect(second.kind).toBe('ok'); if (second.kind !== 'ok') return;
  const repeated = pair.find(t => first.protocol.currentPair!.includes(t));
  expect(second.protocol.currentPair).not.toContain(repeated);
  expect(second.protocol.standings.reduce((a,t)=>a+t.played,0)).toBe(4);
});

test.each(['negative','fraction','unsafe','unknown','other_team','duplicate','too_many','wrong_rest'] as const)('invalid %s input has no side effects', async kind => {
  const pair = protocol.currentPair!;
  const player = protocol.roster.find(p=>p.teamIndex===pair[0])!;
  const restPlayer = protocol.roster.find(p=>!pair.includes(p.teamIndex))!;
  let input: GameResultInput = {score:[1,0],scorers:[]};
  if (kind==='negative') input.score=[-1,0];
  if (kind==='fraction') input.score=[1.5,0];
  if (kind==='unsafe') input.score=[Number.MAX_SAFE_INTEGER+1,0];
  if (kind==='unknown') input.scorers=[{signupId:999999,goals:1}];
  if (kind==='other_team') input.scorers=[{signupId:restPlayer.signupId,goals:1}];
  if (kind==='duplicate') input.scorers=[{signupId:player.signupId,goals:1},{signupId:player.signupId,goals:1}];
  if (kind==='too_many') input.scorers=[{signupId:player.signupId,goals:2}];
  if (kind==='wrong_rest') input.firstRestTeamIndex=pair[0];
  expect((await record(input)).kind).toBe('invalid');
  expect((await getGameProtocol(w.d,w.eventId,true))?.games).toHaveLength(0);
});

test('concurrent results, old retries and changed payload under one request ID are safe', async () => {
  const input: GameResultInput = {score:[2,0],scorers:[]};
  const results=await Promise.all([record(input,'one'),record(input,'two')]);
  const accepted=results.findIndex(r=>r.kind==='ok');
  expect(results.filter(r=>r.kind==='ok')).toHaveLength(1);
  const first=results[accepted]; if(first.kind!=='ok') return;
  await recordGameResult(w.d,w.eventId,w.actorId,{requestId:'later',expectedRevision:first.protocol.revision},{score:[1,0],scorers:[]});
  expect(await record(input,accepted===0?'one':'two',1)).toMatchObject({kind:'ok',appliedRevision:2,protocol:{revision:3}});
  expect((await record({...input,score:[3,0]},accepted===0?'one':'two',1)).kind).toBe('conflict');
  expect((await getGameProtocol(w.d,w.eventId,true))?.games).toHaveLength(2);
});

test('corrections update totals but preserve already played pairs, undo restores the last pair', async () => {
  const first=await record({score:[1,0],scorers:[]}); if(first.kind!=='ok') throw new Error(first.kind);
  const id=first.protocol.games[0].id;
  const corrected=await editGameResult(w.d,w.eventId,id,w.actorId,{requestId:'edit-early',expectedRevision:2},{score:[0,1],scorers:[]});
  if(corrected.kind!=='ok') throw new Error(corrected.kind);
  expect(corrected.protocol.currentPair).toContain(protocol.currentPair![1]);
  const second=await recordGameResult(w.d,w.eventId,w.actorId,{requestId:'second',expectedRevision:3},{score:[0,0],scorers:[]});
  if(second.kind!=='ok') throw new Error(second.kind);
  const late=await editGameResult(w.d,w.eventId,id,w.actorId,{requestId:'edit-late',expectedRevision:4},{score:[1,0],scorers:[]});
  if(late.kind!=='ok') throw new Error(late.kind);
  expect(late.protocol.games[1].pair).toEqual(second.protocol.games[1].pair);
  expect(late.protocol.currentPair).toEqual(second.protocol.currentPair);
  const undone=await undoLastGame(w.d,w.eventId,w.actorId,{requestId:'undo',expectedRevision:5});
  if(undone.kind!=='ok') throw new Error(undone.kind);
  expect(undone.protocol.currentPair).toEqual(second.protocol.games[1].pair);
  const replaced=await recordGameResult(w.d,w.eventId,w.actorId,{requestId:'replacement',expectedRevision:6},{score:[1,0],scorers:[]});
  if(replaced.kind!=='ok') throw new Error(replaced.kind);
  expect(replaced.protocol.games[1].id).not.toBe(second.protocol.games[1].id);
  expect(replaced.protocol.games[1].sequence).toBe(2);
});

test('a guest can score multiple goals; completion permits corrections but stops record and undo', async () => {
  // Make the guest's team take part without changing the frozen snapshot.
  const guest=protocol.roster.find(p=>p.userId===null)!;
  if (!protocol.currentPair!.includes(guest.teamIndex)) {
    const r=await record({score:[1,0],scorers:[]}); if(r.kind!=='ok') throw new Error(r.kind); protocol=r.protocol;
  }
  const score=protocol.currentPair![0]===guest.teamIndex?[3,0] as const:[0,3] as const;
  const r=await record({score,scorers:[{signupId:guest.signupId,goals:2}]},'guest'); if(r.kind!=='ok') throw new Error(r.kind);
  expect(r.protocol.scorers[0]).toMatchObject({signupId:guest.signupId,userId:null,goals:2});
  await w.d.db.update(events).set({completedAt:w.d.now+1}).where(eq(events.id,w.eventId));
  expect((await recordGameResult(w.d,w.eventId,w.actorId,{requestId:'no',expectedRevision:r.protocol.revision},{score:[0,0],scorers:[]})).kind).toBe('completed');
  expect((await undoLastGame(w.d,w.eventId,w.actorId,{requestId:'undo',expectedRevision:r.protocol.revision})).kind).toBe('completed');
  expect((await editGameResult(w.d,w.eventId,r.protocol.games.at(-1)!.id,w.actorId,{requestId:'edit',expectedRevision:r.protocol.revision},{score,scorers:[]})).kind).toBe('ok');
});

describe('assists', () => {
  const sides = () => {
    const pair = protocol.currentPair!;
    const own = protocol.roster.filter(p=>p.teamIndex===pair[0]);
    const other = protocol.roster.find(p=>p.teamIndex===pair[1])!;
    return { pair, scorer: own[0], passer: own[1], other, rest: [0,1,2].find(t=>!pair.includes(t))! };
  };
  test('an assisted goal is stored with the game and replayed for corrections', async () => {
    const { scorer, passer } = sides();
    const r = await record({score:[2,0],scorers:[{signupId:scorer.signupId,goals:2}],assists:[{scorerSignupId:scorer.signupId,assistSignupId:passer.signupId,goals:1}]});
    expect(r.kind).toBe('ok'); if (r.kind !== 'ok') return;
    expect(r.protocol.games[0].assists).toEqual([{scorerSignupId:scorer.signupId,assistSignupId:passer.signupId,goals:1}]);
    const plain = await recordGameResult(w.d,w.eventId,w.actorId,{requestId:'plain',expectedRevision:r.protocol.revision},{score:[0,0],scorers:[]});
    expect(plain.kind).toBe('ok'); if (plain.kind !== 'ok') return;
    expect(plain.protocol.games[1].assists).toEqual([]);
  });
  test.each(['self','other_team','no_goal','too_many','duplicate'] as const)('invalid %s assist has no side effects', async kind => {
    const { scorer, passer, other } = sides();
    const input: GameResultInput = {score:[2,0],scorers:[{signupId:scorer.signupId,goals:1}],assists:[]};
    if (kind==='self') input.assists=[{scorerSignupId:scorer.signupId,assistSignupId:scorer.signupId,goals:1}];
    if (kind==='other_team') input.assists=[{scorerSignupId:scorer.signupId,assistSignupId:other.signupId,goals:1}];
    if (kind==='no_goal') input.assists=[{scorerSignupId:passer.signupId,assistSignupId:scorer.signupId,goals:1}];
    if (kind==='too_many') input.assists=[{scorerSignupId:scorer.signupId,assistSignupId:passer.signupId,goals:2}];
    if (kind==='duplicate') { input.scorers=[{signupId:scorer.signupId,goals:2}]; input.assists=[{scorerSignupId:scorer.signupId,assistSignupId:passer.signupId,goals:1},{scorerSignupId:scorer.signupId,assistSignupId:passer.signupId,goals:1}]; }
    expect((await record(input)).kind).toBe('invalid');
    expect((await getGameProtocol(w.d,w.eventId,true))?.games).toHaveLength(0);
  });
  test('a retry with different assists under one request ID is not a duplicate', async () => {
    const { scorer, passer } = sides();
    const base = {score:[1,0] as [number,number],scorers:[{signupId:scorer.signupId,goals:1}]};
    expect((await record({...base,assists:[]},'same')).kind).toBe('ok');
    const changed = await record({...base,assists:[{scorerSignupId:scorer.signupId,assistSignupId:passer.signupId,goals:1}]},'same',protocol.revision);
    expect(changed.kind).not.toBe('ok');
  });
});
