import type { GamePair, GameResultInput, GameRosterPlayer } from '@altynka/core';

export type GoalRun = { signupId: number | null; goals: number };
export type GoalRuns = [GoalRun[], GoalRun[]];

function compact(runs: GoalRun[]): GoalRun[] {
  const result: GoalRun[]=[];
  for(const run of runs) {
    if(!run.goals) continue;
    const last=result.at(-1);
    if(last?.signupId===run.signupId) last.goals+=run.goals;
    else result.push({...run});
  }
  return result;
}

/** Runs preserve card order without allocating an array proportional to a restored score. */
export function goalRunsFromInput(input: GameResultInput, pair: GamePair, roster: readonly GameRosterPlayer[]): GoalRuns {
  return pair.map((team,side)=>{
    let missing=input.score[side];
    const runs:GoalRun[]=[];
    for(const scorer of input.scorers) {
      if(!missing || !roster.some(p=>p.signupId===scorer.signupId && p.teamIndex===team)) continue;
      const goals=Math.min(missing,scorer.goals);runs.push({signupId:scorer.signupId,goals});missing-=goals;
    }
    return compact([...runs,...(missing>0?[{signupId:null,goals:missing}]:[])]);
  }) as GoalRuns;
}

export function inputFromGoalRuns(input: GameResultInput, runs: GoalRuns): GameResultInput {
  const scorers=new Map<number,number>();
  for(const side of runs) for(const run of side) if(run.signupId!==null) scorers.set(run.signupId,(scorers.get(run.signupId) ?? 0)+run.goals);
  return {...input,score:runs.map(side=>side.reduce((sum,r)=>sum+r.goals,0)) as [number,number],scorers:[...scorers].map(([signupId,goals])=>({signupId,goals}))};
}

export function authorAt(runs: readonly GoalRun[], index: number): number | null {
  for(const run of runs) { if(index<run.goals) return run.signupId; index-=run.goals; }
  return null;
}

export function changeGoalCount(runs: GoalRuns, side: number, delta: 1 | -1): GoalRuns {
  const count=runs[side].reduce((sum,r)=>sum+r.goals,0);
  if(delta===-1 && !count || delta===1 && count===Number.MAX_SAFE_INTEGER) return runs;
  const changed=runs[side].map(r=>({...r}));
  if(delta===1) changed.push({signupId:null,goals:1});
  else changed[changed.length-1].goals--;
  return runs.map((r,i)=>i===side?compact(changed):r) as GoalRuns;
}

export function setGoalAuthor(runs: GoalRuns, side: number, index: number, signupId: number | null): GoalRuns {
  const changed:GoalRun[]=[];
  let position=0;
  for(const run of runs[side]) {
    if(index>=position && index<position+run.goals) changed.push({signupId:run.signupId,goals:index-position},{signupId,goals:1},{signupId:run.signupId,goals:position+run.goals-index-1});
    else changed.push(run);
    position+=run.goals;
  }
  return runs.map((r,i)=>i===side?compact(changed):r) as GoalRuns;
}

export function validGoalRuns(value: unknown, input: GameResultInput): value is GoalRuns {
  if(!Array.isArray(value) || value.length!==2 || !value.every(side=>Array.isArray(side) && side.every(r=>r && (r.signupId===null || Number.isSafeInteger(r.signupId) && r.signupId>0) && Number.isSafeInteger(r.goals) && r.goals>0))) return false;
  const rebuilt=inputFromGoalRuns(input,value as GoalRuns);
  const signature=(scorers:GameResultInput['scorers'])=>JSON.stringify([...scorers].sort((a,b)=>a.signupId-b.signupId));
  return rebuilt.score.every((n,i)=>Number.isSafeInteger(n) && n===input.score[i]) && signature(rebuilt.scorers)===signature(input.scorers);
}
