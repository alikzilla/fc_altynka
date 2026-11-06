import type { Page, Route } from '@playwright/test';
import { calculateScorers, calculateStandings, nextGamePair, resolveFirstRest, type GamePair, type GameResult, type GameResultInput, type GameRosterPlayer } from '../../packages/core/src/games';

/** Stateful synthetic API for browser behavior; real authorization/CAS live in worker tests. */
export function gameStatisticsWorld(options: { count?: 2|3; started?: boolean; theme?: 'dark'|'light' } = {}) {
  const count=options.count ?? 3;
  const now=Date.parse('2026-11-08T16:00:00Z');
  const people=['Али','Санжик','Айкын','Баур','Бека','Ерпа'].map((name,i)=>({id:i+1,seq:i+1,userId:i===5?null:i+1,name,guestOfName:i===5?'Али':null,invitedByUserId:i===5?1:null,level:6}));
  let teams=count===3?[[1,2],[3,4],[5,6]]:[[1,2,3],[4,5,6]];
  let publishedAt:number|null=now;
  let startedAt:number|null=null,completedAt:number|null=null;
  let revision=0;
  let pair:GamePair=[0,1];
  let roster:GameRosterPlayer[]=[];
  let games:GameResult[]=[];
  let finishIds:number[]|null=null;
  let billClosed=false;
  let nextId=1;
  const receipts=new Map<string,{fingerprint:string;revision:number}>();
  const requests:{path:string;body:any}[]=[];
  const world={
    dropNextResult:false,requests,
    get games(){return games;},get pair(){return pair;},get revision(){return revision;},
    closePayment(){billClosed=true;},
    renameGuest(name:string){people[5].name=name;},
    makeGuest(index:number,name:string,inviter:string){people[index].name=name;people[index].userId=null;people[index].guestOfName=inviter;people[index].invitedByUserId=inviter==='Али'?1:2;},
    start(){if(startedAt!==null)return;startedAt=now;revision++;roster=people.map(p=>({signupId:p.id,userId:p.userId,name:p.name,teamIndex:teams.findIndex(t=>t.includes(p.id))}));},
    add(input:GameResultInput){
      const firstRestTeamIndex=count===3 && games.length===0?resolveFirstRest(pair,input.score,input.firstRestTeamIndex):null;
      games.push({id:`game-${nextId++}`,sequence:games.length+1,pair,score:input.score,scorers:input.scorers,firstRestTeamIndex,recordedAt:now,recordedBy:1,updatedAt:now,updatedBy:1});
      pair=nextGamePair(count,games);revision++;
    },
    protocol(manage=true){return {state:completedAt!==null?'completed':startedAt!==null?'playing':'not_started',revision,startedAt,completedAt,teamCount:startedAt===null?null:count,roster,currentPair:startedAt!==null&&completedAt===null?pair:null,restingTeamIndex:count===3&&startedAt!==null&&completedAt===null?[0,1,2].find(t=>!pair.includes(t)):null,games,standings:startedAt===null?[]:calculateStandings(count,games),scorers:calculateScorers(roster,games),canStart:manage&&startedAt===null&&publishedAt!==null,canRecord:manage&&startedAt!==null&&completedAt===null,canEdit:manage&&startedAt!==null,canUndo:manage&&completedAt===null&&games.length>0,canFinish:manage&&startedAt!==null&&completedAt===null};},
    detail(manage=true){return {id:7,community:{id:1,title:'FC Altynka'},viewerRole:manage?'organizer':'player',date:'2026-11-08',serverNow:now,protocolVersion:1,startedAt,completedAt,status:completedAt!==null?'closed':startedAt!==null?'playing':'scheduled',startTime:'20:00',durationHours:2,place:'Arena Football · Абая, 150',comment:null,limit:15,mainCount:people.length,reserveCount:0,my:'main',main:people,reserve:[],teams:{teamCount:count,teams,publishedAt,stale:false},gameProtocol:world.protocol(manage),
      review:completedAt!==null&&finishIds?.length?{state:'open',canFinish:false,completedAt,closesAt:now+72*3600000,gameScore:null}:{state:completedAt!==null?'ineligible':'pending',canFinish:false,completedAt,closesAt:null,gameScore:null},
      bill:billClosed?{id:1,receiver:{userId:1,name:'Али',kaspiPhone:'+77071234567'},fieldAmount:12000,extras:[],total:12000,share:2000,status:'closed',participantSignupIds:people.map(p=>p.id),lines:people.filter(p=>p.userId!==null).map(p=>({id:p.id,userId:p.userId,name:p.name,units:p.id===1?2:1,amount:p.id===1?4000:2000,paidAmount:p.id===1?4000:2000,state:'paid',due:0}))}:null};},
    async attach(page:Page,viewer:{manage?:boolean;userId?:number}={}){
      const manage=viewer.manage ?? true;const userId=viewer.userId ?? 1;
      await page.route('https://telegram.org/**',r=>r.fulfill({body:''}));
      await page.route('**/api/**',async(route:Route)=>{
        const path=new URL(route.request().url()).pathname,method=route.request().method();
        const body=method==='GET'?null:route.request().postDataJSON();
        const reply=(json:unknown,status=200)=>route.fulfill({status,json});
        if(path==='/api/me')return reply({userId,displayName:'Али',kaspiPhone:'+77071234567',profileCompleted:true,theme:options.theme ?? 'dark',communities:[{id:1,title:'FC Altynka',role:manage?'organizer':'player'}],rating:{value:6,initial:6,matchesCount:0,selfAssessment:{teamwork:6,dribbling:6,technique:6,shooting:6,stamina:6,physical:6,passing:6,defending:6}}});
        if(path==='/api/notifications')return reply({tasks:[]});
        if(path==='/api/events')return reply({active:completedAt===null?[world.detail(manage)]:[],past:completedAt===null?[]:[world.detail(manage)]});
        if(path==='/api/matches')return reply({events:completedAt===null?[]:[world.detail(manage)],nextCursor:null});
        if(path==='/api/events/7'&&method==='GET')return reply(world.detail(manage));
        if(path==='/api/events/7/games'&&method==='GET')return reply(world.protocol(manage));
        if(method==='GET')return reply({error:'not_found'},404);
        requests.push({path,body});
        if(!manage)return reply({error:'forbidden'},403);
        if(path==='/api/events/7/teams'&&method==='PUT'){teams=body.teams;publishedAt=null;return reply({kind:'ok'});}
        if(path==='/api/events/7/teams/publish'){publishedAt=now;return reply({kind:'ok'});}
        const {requestId,expectedRevision,...payload}=body;
        const fingerprint=JSON.stringify({path,method,payload});
        const receipt=receipts.get(requestId);
        if(receipt)return receipt.fingerprint===fingerprint?reply({protocol:world.protocol(manage),appliedRevision:receipt.revision}):reply({error:'conflict'},409);
        if(expectedRevision!==revision)return reply({error:'conflict'},409);
        if(path.endsWith('/start'))world.start();
        else if(path==='/api/events/7/games/results'){
          if(completedAt!==null)return reply({error:'completed'},409);
          try{world.add(payload);}catch{return reply({error:'invalid'},400);}
        }else if(path.includes('/games/results/')&&method==='PATCH'){
          const index=games.findIndex(g=>g.id===path.split('/').at(-1));if(index<0)return reply({error:'not_found'},404);
          let rest=games[index].firstRestTeamIndex;
          if(index===0&&games.length===1&&count===3)rest=resolveFirstRest(games[index].pair,payload.score,payload.firstRestTeamIndex);
          games[index]={...games[index],score:payload.score,scorers:payload.scorers,firstRestTeamIndex:rest};
          if(index===0&&games.length===1)pair=nextGamePair(count,games);revision++;
        }else if(path.endsWith('/undo')){const removed=games.pop();if(!removed)return reply({error:'invalid'},400);pair=removed.pair;revision++;}
        else if(path.endsWith('/finish')){completedAt=now;finishIds=payload.participantSignupIds;revision++;}
        else return reply({error:'not_found'},404);
        receipts.set(requestId,{fingerprint,revision});
        if(world.dropNextResult&&path.endsWith('/results')){world.dropNextResult=false;return route.abort('failed');}
        return reply({protocol:world.protocol(manage),appliedRevision:revision});
      });
    },
  };
  if(options.started)world.start();
  return world;
}
