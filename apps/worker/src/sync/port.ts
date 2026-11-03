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
