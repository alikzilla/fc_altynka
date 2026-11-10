import type { FeedDto } from '@altynka/core';
import { apiRequest, localUser, seedUser } from '../helpers';
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

test('reactions: set, replace, remove; only inside the own group and only the three known ones', async () => {
  await apiRequest('/api/events', { method: 'POST', as: w.org, body: { date: '2026-11-07', communityId: w.communityId } });
  const [post] = (await (await apiRequest('/api/feed', { as: w.player })).json() as FeedDto).posts;
  const react = (as: { id: number; first_name: string }, reaction: unknown) => apiRequest(`/api/feed/${post.id}/reaction`, { method: 'PUT', as, body: { reaction } });
  expect(await (await react(w.player, 'fire')).json()).toEqual({ reactions: { fire: 1, good: 0, bad: 0 }, myReaction: 'fire' });
  expect(await (await react(w.org, 'good')).json()).toEqual({ reactions: { fire: 1, good: 1, bad: 0 }, myReaction: 'good' });
  const seen = (await (await apiRequest('/api/feed', { as: w.org })).json() as FeedDto).posts[0];
  expect(seen).toMatchObject({ reactions: { fire: 1, good: 1, bad: 0 }, myReaction: 'good' });
  expect(await (await react(w.player, null)).json()).toEqual({ reactions: { fire: 0, good: 1, bad: 0 }, myReaction: null });
  expect((await react(w.player, 'love')).status).toBe(400);
  await seedUser('Чужой', { tgId: 3003 });
  expect((await react({ id: 3003, first_name: 'Чужой' }, 'fire')).status).toBe(404);
  expect((await apiRequest('/api/feed/999999/reaction', { method: 'PUT', as: w.player, body: { reaction: 'fire' } })).status).toBe(404);
});

test('the Telegram photo from signed initData is remembered for the feed', async () => {
  const withPhoto = { ...w.player, photo_url: 'https://t.me/i/userpic/320/p.jpg' };
  await apiRequest('/api/feed', { as: withPhoto });
  expect((await localUser(w.playerUserId)).photoUrl).toBe('https://t.me/i/userpic/320/p.jpg');
  await apiRequest('/api/feed', { as: { ...w.player, photo_url: 'http://insecure.example/p.jpg' } });
  expect((await localUser(w.playerUserId)).photoUrl).toBeNull();
});

test('a group admin removes a post for everybody; organizers and players cannot', async () => {
  await apiRequest('/api/events', { method: 'POST', as: w.org, body: { date: '2026-11-07', communityId: w.communityId } });
  const [post] = (await (await apiRequest('/api/feed', { as: w.player })).json() as FeedDto).posts;
  expect((await apiRequest(`/api/feed/${post.id}`, { method: 'DELETE', as: w.player })).status).toBe(403);
  expect((await apiRequest(`/api/feed/${post.id}`, { method: 'DELETE', as: w.org })).status).toBe(403);
  await seedUser('Чужой', { tgId: 3003 });
  expect((await apiRequest(`/api/feed/${post.id}`, { method: 'DELETE', as: { id: 3003, first_name: 'Чужой' } })).status).toBe(404);
  expect((await (await apiRequest('/api/feed', { as: w.player })).json() as FeedDto).posts).toHaveLength(1);
  expect((await apiRequest(`/api/feed/${post.id}`, { method: 'DELETE', as: w.admin })).status).toBe(200);
  expect((await apiRequest(`/api/feed/${post.id}`, { method: 'DELETE', as: w.admin })).status).toBe(200);
  expect((await (await apiRequest('/api/feed', { as: w.player })).json() as FeedDto).posts).toEqual([]);
});
