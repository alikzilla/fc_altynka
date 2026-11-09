import type { GameAssist, GamePair, GameResultInput, GameRosterPlayer } from '@altynka/core';

/** One or more consecutive goal cards with the same author and the same pass. Old drafts have no `assist`. */
export type GoalRun = { signupId: number | null; assist?: number | null; goals: number };
export type GoalRuns = [GoalRun[], GoalRun[]];

const passOf = (run: GoalRun): number | null => run.signupId === null ? null : run.assist ?? null;

function compact(runs: GoalRun[]): GoalRun[] {
  const result: GoalRun[]=[];
  for(const run of runs) {
    if(!run.goals) continue;
    const last=result.at(-1);
    if(last?.signupId===run.signupId && passOf(last)===passOf(run)) last.goals+=run.goals;
    else result.push({signupId:run.signupId,assist:passOf(run),goals:run.goals});
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
      let goals=Math.min(missing,scorer.goals);missing-=goals;
      // Assisted goals come first; the order of cards is not stored on the server.
      for(const a of input.assists ?? []) {
        if(a.scorerSignupId!==scorer.signupId || !goals) continue;
        const n=Math.min(goals,a.goals);runs.push({signupId:scorer.signupId,assist:a.assistSignupId,goals:n});goals-=n;
      }
      if(goals) runs.push({signupId:scorer.signupId,assist:null,goals});
    }
    return compact([...runs,...(missing>0?[{signupId:null,assist:null,goals:missing}]:[])]);
  }) as GoalRuns;
}

export function inputFromGoalRuns(input: GameResultInput, runs: GoalRuns): GameResultInput {
  const scorers=new Map<number,number>();
  const assists=new Map<string,GameAssist>();
  for(const side of runs) for(const run of side) {
    if(run.signupId===null) continue;
    scorers.set(run.signupId,(scorers.get(run.signupId) ?? 0)+run.goals);
    const pass=passOf(run);
    if(pass===null) continue;
    const key=`${run.signupId}:${pass}`;
    const pairTotal=assists.get(key);
    if(pairTotal) pairTotal.goals+=run.goals; else assists.set(key,{scorerSignupId:run.signupId,assistSignupId:pass,goals:run.goals});
  }
  const { assists:_previous, ...rest } = input;
  return {...rest,score:runs.map(side=>side.reduce((sum,r)=>sum+r.goals,0)) as [number,number],scorers:[...scorers].map(([signupId,goals])=>({signupId,goals})),...(assists.size?{assists:[...assists.values()]}:{})};
}

function runAt(runs: readonly GoalRun[], index: number): GoalRun | null {
  for(const run of runs) { if(index<run.goals) return run; index-=run.goals; }
  return null;
}
export const authorAt = (runs: readonly GoalRun[], index: number): number | null => runAt(runs,index)?.signupId ?? null;
export function assistAt(runs: readonly GoalRun[], index: number): number | null {
  const run=runAt(runs,index);
  return run ? passOf(run) : null;
}

export function changeGoalCount(runs: GoalRuns, side: number, delta: 1 | -1): GoalRuns {
  const count=runs[side].reduce((sum,r)=>sum+r.goals,0);
  if(delta===-1 && !count || delta===1 && count===Number.MAX_SAFE_INTEGER) return runs;
  const changed=runs[side].map(r=>({...r}));
  if(delta===1) changed.push({signupId:null,assist:null,goals:1});
  else changed[changed.length-1].goals--;
  return runs.map((r,i)=>i===side?compact(changed):r) as GoalRuns;
}

/** Replaces one card; `update` receives the card's current run. */
function setCard(runs: GoalRuns, side: number, index: number, update: (run: GoalRun) => GoalRun): GoalRuns {
  const changed:GoalRun[]=[];
  let position=0;
  for(const run of runs[side]) {
    if(index>=position && index<position+run.goals) changed.push({...run,goals:index-position},{...update(run),goals:1},{...run,goals:position+run.goals-index-1});
    else changed.push(run);
    position+=run.goals;
  }
  return runs.map((r,i)=>i===side?compact(changed):r) as GoalRuns;
}

/** A pass survives an author change only while it still belongs to a teammate other than the new author. */
export function setGoalAuthor(runs: GoalRuns, side: number, index: number, signupId: number | null): GoalRuns {
  return setCard(runs,side,index,run=>({signupId,assist:signupId===null || passOf(run)===signupId ? null : passOf(run),goals:1}));
}

export function setGoalAssist(runs: GoalRuns, side: number, index: number, assist: number | null): GoalRuns {
  return setCard(runs,side,index,run=>({signupId:run.signupId,assist:run.signupId===null || assist===run.signupId ? null : assist,goals:1}));
}

export function validGoalRuns(value: unknown, input: GameResultInput): value is GoalRuns {
  const id=(n:unknown)=>Number.isSafeInteger(n) && (n as number)>0;
  if(!Array.isArray(value) || value.length!==2 || !value.every(side=>Array.isArray(side) && side.every(r=>r && (r.signupId===null || id(r.signupId)) && (r.assist===undefined || r.assist===null || id(r.assist)) && Number.isSafeInteger(r.goals) && r.goals>0))) return false;
  const rebuilt=inputFromGoalRuns(input,value as GoalRuns);
  const signature=(v:GameResultInput)=>JSON.stringify([[...v.scorers].sort((a,b)=>a.signupId-b.signupId),[...(v.assists ?? [])].sort((a,b)=>a.scorerSignupId-b.scorerSignupId || a.assistSignupId-b.assistSignupId)]);
  return rebuilt.score.every((n,i)=>Number.isSafeInteger(n) && n===input.score[i]) && signature(rebuilt)===signature(input);
}
