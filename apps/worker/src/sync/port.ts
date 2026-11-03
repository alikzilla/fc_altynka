export type Part = 'event' | 'teams' | 'bill';

export type Notice =
  | { kind: 'promoted'; signupIds: number[] }
  | { kind: 'demoted'; signupIds: number[] }
  | { kind: 'scheduled' }
  | { kind: 'cancelled' }
  | { kind: 'reminder'; billId: number };

export interface SyncRequest {
  parts: Part[];
  notices?: Notice[];
}

export interface SyncPort {
  request(eventId: number, req: SyncRequest): Promise<void>;
}

import type { Env } from '../env';

/** Боевой порт: один Durable Object на сбор. */
export function doSyncPort(env: Pick<Env, 'EVENT_SYNC'>): SyncPort {
  return {
    request: (eventId, req) => env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName(`event:${eventId}`)).request(eventId, req),
  };
}
