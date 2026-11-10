import type { FeedDto } from '@altynka/core';
import { apiRequest, seedUser } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);

test('the feed is shared by the whole group and invisible outside it', async () => {
  const created = await apiRequest('/api/events', { method: 'POST', as: w.org, body: { date: '2026-11-07', communityId: w.communityId } });
  const { id } = await created.json() as { id: number };
  const mine = await (await apiRequest('/api/feed', { as: w.player })).json() as FeedDto;
  expect(mine.posts).toHaveLength(1);
  expect(mine.posts[0]).toMatchObject({ kind: 'signup_open', eventId: id, eventDate: '2026-11-07', userId: null, teamColor: null });
  expect(mine.posts[0].text).toMatch(/7 ноября/);
  await seedUser('Чужой', { tgId: 3003 });
  const foreign = await (await apiRequest('/api/feed', { as: { id: 3003, first_name: 'Чужой' } })).json() as FeedDto;
  expect(foreign.posts).toEqual([]);
  expect((await apiRequest('/api/feed', { as: null })).status).toBe(401);
});
