import type { SyncPort, SyncRequest } from '../../src/sync/port';

export class FakeSync implements SyncPort {
  calls: { eventId: number; req: SyncRequest }[] = [];
  async request(eventId: number, req: SyncRequest): Promise<void> {
    this.calls.push({ eventId, req });
  }
}
