import type { GameMutationMeta, GameState } from '@altynka/core';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, type EventRow } from '../db/schema';
import { getEvent, type Deps } from './events';

export interface GameStoredCommand {
  fingerprint: string; state: GameState; startedAt: number | null; completedAt: number | null;
  status?: EventRow['status'];
}
export type GameCommitResult = { kind: 'ok'; appliedRevision: number; duplicate: boolean } | { kind: 'conflict' | 'not_found' };

export const parseGameState = (ev: EventRow): GameState | null => ev.gameStateJson ? JSON.parse(ev.gameStateJson) as GameState : null;

export async function loadGameState(db: Db, eventId: number): Promise<GameState | null> {
  const ev = await getEvent(db, eventId);
  return ev ? parseGameState(ev) : null;
}

export function previousGameCommand(ev: EventRow, meta: GameMutationMeta, fingerprint: string): GameCommitResult | null {
  const receipt = parseGameState(ev)?.receipts.find(r => r.requestId === meta.requestId);
  return receipt ? receipt.fingerprint === fingerprint ? { kind: 'ok', appliedRevision: receipt.revision, duplicate: true } : { kind: 'conflict' } : null;
}

export async function commitGameCommand(d: Deps, ev: EventRow, meta: GameMutationMeta, command: GameStoredCommand): Promise<GameCommitResult> {
  const current = await getEvent(d.db, ev.id);
  if (!current) return { kind: 'not_found' };
  const previous = previousGameCommand(current, meta, command.fingerprint);
  if (previous) return previous;
  if (current.gameRevision !== meta.expectedRevision) return { kind: 'conflict' };
  const revision = meta.expectedRevision + 1;
  const state: GameState = { ...command.state, receipts: [...command.state.receipts, { requestId: meta.requestId, fingerprint: command.fingerprint, revision }] };
  const guard = [eq(events.id, ev.id), eq(events.protocolVersion, 1), eq(events.gameRevision, meta.expectedRevision)];
  if (ev.startedAt === null) guard.push(isNull(events.startedAt), eq(events.rosterRevision, ev.rosterRevision), eq(events.status, ev.status));
  if (command.status !== undefined) guard.push(eq(events.status, ev.status));
  const saved = await d.db.update(events).set({
    startedAt: command.startedAt, completedAt: command.completedAt, gameRevision: revision,
    gameStateJson: JSON.stringify(state), ...(command.status === undefined ? {} : { status: command.status }),
  }).where(and(...guard)).returning({ id: events.id });
  if (saved.length) return { kind: 'ok', appliedRevision: revision, duplicate: false };
  const latest = await getEvent(d.db, ev.id);
  return latest ? previousGameCommand(latest, meta, command.fingerprint) ?? { kind: 'conflict' } : { kind: 'not_found' };
}

/** D1/Drizzle wrap SQLite errors in cause; guards are expected state conflicts. */
export function isGameRosterLocked(error: unknown): boolean {
  for (let cause = error as { message?: string; cause?: unknown } | undefined; cause; cause = cause.cause as typeof cause) {
    if (String(cause.message ?? '').includes('game_roster_locked')) return true;
  }
  return false;
}
