import { apiRequest } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);
const get = async () => (await apiRequest('/api/me', { as: w.player })).json();
const patch = (body: unknown) => apiRequest('/api/me', { as: w.player, method: 'PATCH', body });
test('theme defaults dark and persists light without changing other preferences or initial setup', async () => {
  expect(await get()).toMatchObject({ theme: 'dark', profileCompleted: false, notifications: { enabled: false } });
  expect(await (await patch({ theme: 'light' })).json()).toMatchObject({ theme: 'light' });
  expect(await get()).toMatchObject({ theme: 'light', profileCompleted: false, notifications: { enabled: false } });
  expect(await (await apiRequest('/api/me', { as: w.org })).json()).toMatchObject({ theme: 'dark' });
  await patch({ theme: 'dark' });
  expect(await get()).toMatchObject({ theme: 'dark' });
});
test.each(['system', 'black', null, true])('invalid theme %j is rejected without saving unrelated changes', async theme => {
  expect((await patch({ theme, playingPosition: 'forward' })).status).toBe(400);
  expect(await get()).toMatchObject({ theme: 'dark', playingPosition: null });
});
