import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { communities,events,memberships } from '../../src/db/schema';
import { playerProfile } from '../../src/domain/ratings';
import { db,seedUser } from '../helpers';

async function world(){
  const [a,b]=await db().insert(communities).values([{tgChatId:-101,title:'Shared'},{tgChatId:-102,title:'Private'}]).returning();
  const target=await seedUser('Target',{communityId:a.id});
  const viewer=await seedUser('Viewer',{communityId:a.id});
  await db().insert(memberships).values({communityId:b.id,userId:target.id,telegramAdmin:true});
  return {a,b,target,viewer};
}
async function session(communityId:number,userId:number,options:{date?:string;goals?:number;status?:'closed'|'cancelled';startedAt?:number|null}={}){
  const state={teamCount:2,roster:[{signupId:101,userId,name:'Old name',teamIndex:0},{signupId:102,userId:null,name:'Old name',teamIndex:0}],initialPair:[0,1],currentPair:[0,1],receipts:[],finishParticipants:null,games:[{id:'g1',sequence:1,pair:[0,1],score:[2,0],scorers:[{signupId:101,goals:options.goals??1},{signupId:102,goals:1}],firstRestTeamIndex:null,recordedAt:1,recordedBy:userId,updatedAt:1,updatedBy:userId}]};
  const [ev]=await db().insert(events).values({communityId,date:options.date??'2026-11-06',status:options.status??'closed',protocolVersion:1,startedAt:options.startedAt===undefined?1:options.startedAt,gameStateJson:JSON.stringify(state),createdBy:userId,createdAt:1}).returning();
  return {ev,state};
}
test('profile statistics are immediate, read-only, independent of voting and updated from stored protocol',async()=>{
  const w=await world();const {ev,state}=await session(w.a.id,w.target.id);
  const before=await playerProfile(db(),w.target.id,w.target.id,2);
  expect(before).toMatchObject({statistics:{games:1,goals:1,wins:1,assists:0},gameHistory:[{eventId:ev.id,games:1,goals:1}]});
  expect(before!.history).toEqual([]);
  state.games[0].scorers=[];state.games[0].score=[0,1];
  await db().update(events).set({gameStateJson:JSON.stringify(state)}).where(eq(events.id,ev.id));
  expect(await playerProfile(db(),w.target.id,w.target.id,2)).toMatchObject({statistics:{games:1,goals:0,wins:0,losses:1}});
  state.games=[];
  await db().update(events).set({gameStateJson:JSON.stringify(state)}).where(eq(events.id,ev.id));
  expect(await playerProfile(db(),w.target.id,w.target.id,2)).toMatchObject({statistics:{games:0,goals:0},gameHistory:[]});
  expect((await env.DB.prepare('SELECT game_state_json FROM events WHERE id=?').bind(ev.id).first<{game_state_json:string}>())!.game_state_json).toBe(JSON.stringify(state));
});
test('peer statistics and role exclude private groups while own history survives leaving a group',async()=>{
  const w=await world();await session(w.a.id,w.target.id);await session(w.b.id,w.target.id);
  expect(await playerProfile(db(),w.target.id,w.viewer.id,2)).toMatchObject({role:'player',statistics:{games:1,goals:1}});
  await db().update(memberships).set({active:false}).where(eq(memberships.communityId,w.b.id));
  expect(await playerProfile(db(),w.target.id,w.target.id,2)).toMatchObject({statistics:{games:2,goals:2}});
  const outsider=await seedUser('Outsider');
  expect(await playerProfile(db(),w.target.id,outsider.id,2)).toBeNull();
});
test('cancelled and unstarted protocols are excluded, totals are not truncated to 20 history rows',async()=>{
  const w=await world();
  for(let i=0;i<22;i++)await session(w.a.id,w.target.id,{date:`2026-10-${String(i+1).padStart(2,'0')}`});
  await session(w.a.id,w.target.id,{status:'cancelled'});await session(w.a.id,w.target.id,{startedAt:null});
  const profile=await playerProfile(db(),w.target.id,w.target.id,2);
  expect(profile).toMatchObject({statistics:{meetings:22,games:22,goals:22}});
  expect(profile!.gameHistory).toHaveLength(20);
  expect(profile!.gameHistory[0].date).toBe('2026-10-22');
});
test('the home feed carries the viewer result of a finished match: team, rank and own goals',async()=>{
  const { listEvents } = await import('../../src/domain/eventView');
  const w=await world();const {ev}=await session(w.a.id,w.target.id,{goals:2});
  await db().update(events).set({completedAt:2}).where(eq(events.id,ev.id));
  const mine=await listEvents(db(),[{id:w.a.id,title:'Shared'}],w.target.id,Date.parse('2026-11-08T10:00:00Z'));
  expect(mine.past.find(row=>row.id===ev.id)?.myResult).toEqual({games:1,goals:2,wins:1,draws:0,losses:0,teamIndex:0,teamCount:2,teamRank:1,colors:['red','blue']});
  const theirs=await listEvents(db(),[{id:w.a.id,title:'Shared'}],w.viewer.id,Date.parse('2026-11-08T10:00:00Z'));
  expect(theirs.past.find(row=>row.id===ev.id)?.myResult).toBeNull();
});
