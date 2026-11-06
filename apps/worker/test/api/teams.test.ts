import type { EventDetailDto } from '@altynka/core';
import { apiRequest } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);

test('organizer saves and publishes teams; player cannot', async () => {
  const { id } = (await (await apiRequest('/api/events', { method: 'POST', as: w.org, body: { date: '2026-11-07', communityId: w.communityId } })).json()) as { id: number };
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.org });
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.player });
  const d = (await (await apiRequest(`/api/events/${id}`, { as: w.org })).json()) as EventDetailDto;
  const body = { teamCount: 2, teams: [[d.main[0].id], [d.main[1].id]], guestLevels: {} };
  expect((await apiRequest(`/api/events/${id}/teams`, { method: 'PUT', as: w.player, body })).status).toBe(403);
  expect((await apiRequest(`/api/events/${id}/teams`, { method: 'PUT', as: w.org, body: { ...body, teams: [[d.main[0].id], []] } })).status).toBe(400);
  expect((await apiRequest(`/api/events/${id}/teams`, { method: 'PUT', as: w.org, body })).status).toBe(200);
  expect((await apiRequest(`/api/events/${id}/teams/publish`, { method: 'POST', as: w.org })).status).toBe(200);
  const after = (await (await apiRequest(`/api/events/${id}`, { as: w.player })).json()) as EventDetailDto;
  expect(after.teams).toMatchObject({ teamCount: 2, teams: body.teams, stale: false });
  expect(after.teams!.publishedAt).toEqual(expect.any(Number));
});
