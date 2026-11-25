import { env } from 'cloudflare:test';
import { apiRequest } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);
const get = async (as = w.player) => (await apiRequest('/api/me', { as })).json();
const patch = (body: unknown) => apiRequest('/api/me', { as: w.player, method: 'PATCH', body });

test('favourite club defaults to null, persists barcelona, clears with null, other user unaffected', async () => {
  expect(await get()).toMatchObject({ favoriteClub: null });
  expect(await (await patch({ favoriteClub: 'barcelona' })).json()).toMatchObject({ favoriteClub: 'barcelona' });
  expect(await get()).toMatchObject({ favoriteClub: 'barcelona' });
  expect(await get(w.org)).toMatchObject({ favoriteClub: null });
  expect(await (await patch({ favoriteClub: null })).json()).toMatchObject({ favoriteClub: null });
  expect(await get()).toMatchObject({ favoriteClub: null });
});
test('rejects an unknown club with 400 and keeps the stored value', async () => {
  await patch({ favoriteClub: 'barcelona' });
  expect((await patch({ favoriteClub: 'dinamo-zagreb' })).status).toBe(400);
  expect(await get()).toMatchObject({ favoriteClub: 'barcelona' });
});
test('a stored id missing from the catalog reads as null', async () => {
  await env.DB.prepare('UPDATE users SET favorite_club = ? WHERE id = ?').bind('dinamo-zagreb', w.playerUserId).run();
  expect(await get()).toMatchObject({ favoriteClub: null });
});
test('a PATCH without favoriteClub keeps the stored club', async () => {
  await patch({ favoriteClub: 'barcelona' });
  expect(await (await patch({ theme: 'dark' })).json()).toMatchObject({ favoriteClub: 'barcelona' });
  expect(await get()).toMatchObject({ favoriteClub: 'barcelona' });
});
test("player profile carries the owner's favourite club", async () => {
  expect(await (await apiRequest(`/api/players/${w.playerUserId}`, { as: w.org })).json()).toMatchObject({ favoriteClub: null });
  await patch({ favoriteClub: 'barcelona' });
  expect(await (await apiRequest(`/api/players/${w.playerUserId}`, { as: w.org })).json()).toMatchObject({ favoriteClub: 'barcelona' });
  await env.DB.prepare('UPDATE users SET favorite_club = ? WHERE id = ?').bind('dinamo-zagreb', w.playerUserId).run();
  expect(await (await apiRequest(`/api/players/${w.playerUserId}`, { as: w.org })).json()).toMatchObject({ favoriteClub: null });
});
