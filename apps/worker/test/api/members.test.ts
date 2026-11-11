import type { EventDetailDto, MemberDto, PlayerProfileDto, PlayersDto } from '@altynka/core';
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

test('only the admin marks an injury; it shows in members, players, the profile and match signups', async () => {
  const patch = (as: typeof w.org, body: unknown) =>
    apiRequest(`/api/members/${w.playerUserId}?communityId=${w.communityId}`, { method: 'PATCH', as, body });
  expect((await patch(w.org, { injured: true })).status).toBe(403);
  expect((await patch(w.player, { injured: true })).status).toBe(403);
  expect((await patch(w.admin, { injured: 'yes' })).status).toBe(400);
  const r = await patch(w.admin, { injured: true });
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ userId: w.playerUserId, injured: true, role: 'player' });

  const players = (await (await apiRequest('/api/players', { as: w.org })).json()) as PlayersDto;
  const listed = players.groups[0].players;
  expect(listed.find(p => p.userId === w.playerUserId)?.injured).toBe(true);
  expect(listed.filter(p => p.userId !== w.playerUserId).every(p => p.injured === false)).toBe(true);
  const profile = (await (await apiRequest(`/api/players/${w.playerUserId}`, { as: w.org })).json()) as PlayerProfileDto;
  expect(profile.injured).toBe(true);

  const created = await apiRequest('/api/events', { method: 'POST', as: w.org, body: { date: '2026-11-07', communityId: w.communityId } });
  const id = ((await created.json()) as { id: number }).id;
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.player });
  await apiRequest(`/api/events/${id}/join`, { method: 'POST', as: w.org });
  const detail = (await (await apiRequest(`/api/events/${id}`, { as: w.player })).json()) as EventDetailDto;
  expect(detail.main.map(s => s.injured ?? false)).toEqual([true, false]);

  const cleared = await patch(w.admin, { injured: false });
  expect(await cleared.json()).toMatchObject({ injured: false, role: 'player' });
  const after = (await (await apiRequest(`/api/events/${id}`, { as: w.player })).json()) as EventDetailDto;
  expect(after.main.some(s => s.injured)).toBe(false);
});

test('a regular player sees the injury the admin set when opening that player\'s profile', async () => {
  const mark = await apiRequest(`/api/members/${w.orgUserId}?communityId=${w.communityId}`, { method: 'PATCH', as: w.admin, body: { injured: true } });
  expect(mark.status).toBe(200);
  // Another ordinary member of the group, not the admin and not the injured player.
  const viewer = (await (await apiRequest(`/api/players/${w.orgUserId}`, { as: w.player })).json()) as PlayerProfileDto;
  expect(viewer).toMatchObject({ userId: w.orgUserId, injured: true });
  const own = (await (await apiRequest(`/api/players/${w.orgUserId}`, { as: w.org })).json()) as PlayerProfileDto;
  expect(own.injured).toBe(true);
  const healthy = (await (await apiRequest(`/api/players/${w.playerUserId}`, { as: w.org })).json()) as PlayerProfileDto;
  expect(healthy.injured).toBe(false);
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
