import { opsIncidents } from '../../src/db/schema';
import { apiRequest, db } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(teardownApiWorld);

const send = (body: unknown, as: ApiWorld['player'] | null = w.player) => apiRequest('/api/client-errors', { as, method: 'POST', body });
const valid = { message: 'TypeError: x is undefined', stack: 'at Bill (Bill.tsx:10)', path: '/event/7', source: 'boundary' };

test('a mini app error waits in the incident log for the next alert, with the screen and the person', async () => {
  const r = await send(valid);
  expect(r.status).toBe(204);
  expect(await db().select({ kind: opsIncidents.kind, detail: opsIncidents.detail }).from(opsIncidents))
    .toEqual([{ kind: 'client_error', detail: `/event/7: TypeError: x is undefined (user ${w.playerUserId})` }]);
});

test('reports need a Telegram signature and a valid shape', async () => {
  expect((await send(valid, null)).status).toBe(401);
  expect((await send({ ...valid, source: 'other' })).status).toBe(400);
  expect((await send({ ...valid, message: 'x'.repeat(501) })).status).toBe(400);
  expect(await db().select().from(opsIncidents)).toEqual([]);
});
