import type { GamePair, GameResultInput } from '@altynka/core';
import { validGoalRuns, type GoalRuns } from './gameGoalRuns';

export interface GameResultDraft {
  version: 1; gameId: string | null; pair: GamePair; revision: number; requestId: string;
  input: GameResultInput; submitted: boolean;
  goalRuns?: GoalRuns;
}
const key = (eventId: number, userId: number) => `altynka:game-draft:v1:${userId}:${eventId}`;
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

export function readGameDraft(eventId: number, userId: number): GameResultDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(eventId,userId)) ?? 'null');
    if (!value || value.version !== 1 || !Array.isArray(value.pair) || value.pair.length !== 2 || !value.pair.every((n:unknown)=>integer(n)&&n<3) || value.pair[0] === value.pair[1]) return null;
    if (!integer(value.revision) || typeof value.requestId !== 'string' || !value.requestId.length || value.requestId.length > 100 || typeof value.submitted !== 'boolean') return null;
    if (value.gameId !== null && (typeof value.gameId !== 'string' || !value.gameId.length || value.gameId.length > 100)) return null;
    const input = value.input;
    if (!input || !Array.isArray(input.score) || input.score.length !== 2 || !input.score.every(integer) || !Array.isArray(input.scorers) || input.scorers.length > 100) return null;
    if (!input.scorers.every((p: {signupId?:unknown;goals?:unknown}|null)=>p && integer(p.signupId) && p.signupId>0 && integer(p.goals) && p.goals>0)) return null;
    if (input.firstRestTeamIndex !== undefined && (!integer(input.firstRestTeamIndex) || input.firstRestTeamIndex>2)) return null;
    // Invalid optional presentation metadata must never discard or alter a retry command.
    if(value.goalRuns!==undefined && !validGoalRuns(value.goalRuns,input)) delete value.goalRuns;
    return value as GameResultDraft;
  } catch { return null; }
}
export function writeGameDraft(eventId: number, userId: number, draft: GameResultDraft): void {
  try { localStorage.setItem(key(eventId,userId),JSON.stringify(draft)); } catch { /* Storage may be unavailable in a WebView. */ }
}
export function clearGameDraft(eventId: number, userId: number): void {
  try { localStorage.removeItem(key(eventId,userId)); } catch { /* Saving the result does not depend on local storage. */ }
}

export interface GameFinishDraft { version:1; requestId:string; expectedRevision:number; participantSignupIds:number[] }
export function readGameFinish(eventId:number,userId:number):GameFinishDraft|null {
  try {
    const value=JSON.parse(localStorage.getItem(`${key(eventId,userId)}:finish`) ?? 'null');
    return value?.version===1 && typeof value.requestId==='string' && value.requestId.length>0 && value.requestId.length<=100 && integer(value.expectedRevision)
      && Array.isArray(value.participantSignupIds) && value.participantSignupIds.length<=100 && value.participantSignupIds.every((id:unknown)=>integer(id)&&id>0)
      && new Set(value.participantSignupIds).size===value.participantSignupIds.length ? value : null;
  } catch {return null;}
}
export function writeGameFinish(eventId:number,userId:number,command:GameFinishDraft):void {
  try {localStorage.setItem(`${key(eventId,userId)}:finish`,JSON.stringify(command));}catch{/* Keep the in-memory command when storage is unavailable. */}
}
export function clearGameFinish(eventId:number,userId:number):void {
  try {localStorage.removeItem(`${key(eventId,userId)}:finish`);}catch{/* Completion still succeeds without storage. */}
}
