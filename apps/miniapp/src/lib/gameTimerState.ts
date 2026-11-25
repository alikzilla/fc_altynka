import type { EventDetailDto, GameTimer, StoredGameTimer } from '@altynka/core';
import { ApiError } from './api';

/** This device's latest write: `confirmedAt` is null while it waits for the server (also across reloads). */
export type LocalTimer = { timer: StoredGameTimer; confirmedAt: number | null };

/**
 * The newer of the server timer and this device's write. A null server timer is ambiguous (never started or
 * reset elsewhere), so a confirmed write stops counting once a snapshot served after its confirmation arrives.
 */
export function effectiveTimer(ev: EventDetailDto, local: LocalTimer | null): GameTimer | null {
  const protocol = ev.gameProtocol;
  if (protocol?.state !== 'playing') return null;
  const server = protocol.timer ?? null;
  if (!local || local.timer.gameSequence !== protocol.games.length + 1) return server;
  if (server && server.updatedAt >= local.timer.updatedAt) return server;
  if (local.confirmedAt !== null && (ev.serverNow ?? 0) > local.confirmedAt) return server;
  return 'reset' in local.timer ? null : local.timer;
}

/** A write the server refused for good (bad request, conflict, no rights): retrying cannot help. */
export function isFinalRejection(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}
