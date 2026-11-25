import { GAME_TIMER_MAX_SEC, GAME_TIMER_MIN_SEC, currentTimer, type GameTimer, type StoredGameTimer } from '@altynka/core';
import { and, eq, isNull } from 'drizzle-orm';
import { events } from '../db/schema';
import { getEvent, type Deps } from './events';
import { parseGameState } from './gameStore';

export type SetGameTimerResult = { kind: 'ok'; timer: GameTimer | null } | { kind: 'not_found' | 'conflict' | 'invalid'; reason?: string };

const SKEW_MS = 6 * 3600_000;

function validTimer(input: StoredGameTimer, now: number): boolean {
  const near = (t: number) => Math.abs(t - now) <= SKEW_MS;
  if (!near(input.updatedAt)) return false;
  if ('reset' in input) return true;
  const { durationSec, startedAt, pausedAt, pausedMs } = input;
  return durationSec >= GAME_TIMER_MIN_SEC && durationSec <= GAME_TIMER_MAX_SEC && durationSec % 60 === 0
    && near(startedAt) && pausedMs >= 0 && (pausedAt === null || (near(pausedAt) && pausedAt >= startedAt));
}

/**
 * The shared timer is a last-writer-wins value keyed by `updatedAt`; it never bumps `gameRevision`,
 * so it cannot make a result write conflict. A stored reset marker keeps the ordering across resets.
 */
export async function setGameTimer(d: Deps, eventId: number, input: StoredGameTimer): Promise<SetGameTimerResult> {
  if (!validTimer(input, d.now)) return { kind: 'invalid' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const ev = await getEvent(d.db, eventId);
    if (!ev) return { kind: 'not_found' };
    if (ev.protocolVersion !== 1 || ev.startedAt === null || ev.completedAt !== null || ev.status === 'cancelled') return { kind: 'conflict' };
    const played = parseGameState(ev)?.games.length ?? 0;
    if (input.gameSequence !== played + 1) return { kind: 'conflict' };
    const stored = ev.gameTimerJson ? JSON.parse(ev.gameTimerJson) as StoredGameTimer : null;
    if (stored && stored.gameSequence === input.gameSequence && stored.updatedAt > input.updatedAt) return { kind: 'ok', timer: currentTimer(stored, played) };
    const saved = await d.db.update(events).set({ gameTimerJson: JSON.stringify(input) })
      .where(and(eq(events.id, eventId), ev.gameTimerJson === null ? isNull(events.gameTimerJson) : eq(events.gameTimerJson, ev.gameTimerJson)))
      .returning({ id: events.id });
    if (saved.length) return { kind: 'ok', timer: currentTimer(input, played) };
  }
  return { kind: 'conflict' };
}
