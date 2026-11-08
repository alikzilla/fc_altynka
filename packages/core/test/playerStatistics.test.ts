import * as core from '../src';
import type { GameState } from '../src';

const game=(id:string,pair:readonly[number,number],score:readonly[number,number],scorers:{signupId:number;goals:number}[]=[])=>({id,sequence:Number(id),pair,score,scorers,firstRestTeamIndex:null,recordedAt:1,recordedBy:1,updatedAt:1,updatedBy:1});
const protocol=():GameState=>({teamCount:3,roster:[
  {signupId:11,userId:1,name:'Same',teamIndex:0},
  {signupId:12,userId:null,name:'Same',teamIndex:0},
  {signupId:13,userId:2,name:'Opponent',teamIndex:1},
],initialPair:[0,1],currentPair:[0,1],receipts:[],finishParticipants:null,games:[
  game('1',[0,1],[2,1],[{signupId:11,goals:1},{signupId:12,goals:1}]),
  game('2',[1,2],[1,0]),
  game('3',[0,2],[1,1],[{signupId:11,goals:1}]),
]});

test('only the frozen user identity receives own-team games and attributed goals',()=>{
  const result=core.summarizePlayerProtocol(protocol(),1);
  expect(result).toMatchObject({games:2,goals:2,wins:1,draws:1,losses:0});
  expect(result.results.map(g=>[g.sequence,g.goals,g.outcome])).toEqual([[1,1,'win'],[3,1,'draw']]);
  expect(core.summarizePlayerProtocol(protocol(),999).games).toBe(0);
});
test('edited scores, goals and removed games replace previous statistics without duplicate accumulation',()=>{
  const state=protocol();
  state.games[0]={...state.games[0],score:[0,3],scorers:[]};state.games.pop();
  expect(core.summarizePlayerProtocol(state,1)).toMatchObject({games:1,goals:0,wins:0,draws:0,losses:1});
});
test('aggregate counts meetings once and calculates all-time best meeting independently of displayed history',()=>{
  const a=core.summarizePlayerProtocol(protocol(),1);
  const b=core.summarizePlayerProtocol({...protocol(),games:[game('1',[0,1],[4,0],[{signupId:11,goals:4}])]},1);
  expect(core.aggregatePlayerStatistics([a,b,core.summarizePlayerProtocol(protocol(),999)])).toEqual({meetings:2,games:3,goals:6,assists:0,wins:2,draws:1,losses:0,winPercentage:67,bestGoalsInMeeting:4});
  expect(core.aggregatePlayerStatistics([])).toMatchObject({meetings:0,games:0,goals:0,assists:0,winPercentage:null});
});
test('a hat-trick achievement requires three goals in the same meeting',()=>{
  const a=core.summarizePlayerProtocol(protocol(),1);
  const rows=core.playerAchievements(core.aggregatePlayerStatistics([a,a]));
  expect(rows.find(r=>r.id==='hat-trick')).toMatchObject({current:2,target:3,earned:false});
  expect(rows.find(r=>r.id==='first-goal')?.earned).toBe(true);
});
