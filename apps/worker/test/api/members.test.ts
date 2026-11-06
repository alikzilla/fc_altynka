import type { MemberDto } from '@altynka/core';
import { apiRequest } from '../helpers';
import { setupApiWorld, teardownApiWorld, type ApiWorld } from './setup';

let w: ApiWorld;
beforeEach(async () => { w = await setupApiWorld(); });
afterEach(teardownApiWorld);

test('PATCH /api/me normalizes Kaspi phone and rejects junk', async () => {
  expect((await apiRequest('/api/me', { method: 'PATCH', as: w.player, body: { kaspiPhone: '8 707 123 45 67' } })).status).toBe(200);
  expect(await (await apiRequest('/api/me', { as: w.player })).json()).toMatchObject({ kaspiPhone: '+77071234567' });
  const bad = await apiRequest('/api/me', { method: 'PATCH', as: w.player, body: { kaspiPhone: 'abc' } });
  expect(bad.status).toBe(400);
  expect(await bad.json()).toEqual({ error: 'bad_phone' });
  await apiRequest('/api/me', { method: 'PATCH', as: w.player, body: { displayName: '  Дамир-вратарь ' } });
  expect(await (await apiRequest('/api/me', { as: w.player })).json()).toMatchObject({ displayName: 'Дамир-вратарь' });
});

test('only organizers list members', async () => {
  expect((await apiRequest(`/api/members?communityId=${w.communityId}`, { as: w.player })).status).toBe(403);
  const list = (await (await apiRequest(`/api/members?communityId=${w.communityId}`, { as: w.org })).json()) as MemberDto[];
  expect(list.map(m => m.displayName).sort()).toEqual(['Админ', 'Игрок', 'Орг']);
  expect(list.find(m => m.displayName === 'Админ')!.role).toBe('admin');
});

test('only admin edits roles and calculated levels cannot be overridden', async () => {
  const patch = (as: typeof w.org, body: unknown) =>
    apiRequest(`/api/members/${w.playerUserId}?communityId=${w.communityId}`, { method: 'PATCH', as, body });
  expect((await patch(w.org, { level: 8 })).status).toBe(403);
  expect((await patch(w.admin, { level: 11 })).status).toBe(400);
  expect((await patch(w.admin, { level: 8 })).status).toBe(400);
  const r = await patch(w.admin, { role: 'organizer' });
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ level: 5, role: 'organizer' });
});

test('a display name taken by someone else is refused', async () => {
  const mine = await apiRequest('/api/me', { method: 'PATCH', as: w.player, body: { displayName: ' орг ' } });
  expect(mine.status).toBe(409);
  expect(await mine.json()).toEqual({ error: 'name_taken' });
  expect((await apiRequest('/api/me', { method: 'PATCH', as: w.player, body: { displayName: 'Игрок' } })).status).toBe(200);
  const byAdmin = await apiRequest(`/api/members/${w.playerUserId}?communityId=${w.communityId}`, { method: 'PATCH', as: w.admin, body: { displayName: 'Орг' } });
  expect(byAdmin.status).toBe(409);
  expect(await byAdmin.json()).toEqual({ error: 'name_taken' });
});
