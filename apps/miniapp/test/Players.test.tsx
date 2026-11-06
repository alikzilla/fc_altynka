import { type MemberDto, type PlayerSummaryDto } from '@altynka/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api, ApiError } from '../src/lib/api';
import { Players } from '../src/screens/Players';
import { admin, organizer, player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');
const members: MemberDto[] = [{ userId: 12, displayName: 'Арман', role: 'player', level: 5 }, { userId: 1, displayName: 'Орг', role: 'organizer', level: 7 }];
const players: PlayerSummaryDto[] = members.map(m => ({ userId: m.userId, displayName: m.displayName, playingPosition: null, dominantFoot: null, rating: { value: m.level, initial: m.level, selfAssessment: null, matchesCount: 0 } }));
let role: 'admin' | 'organizer' | 'player';
beforeEach(() => {
  role = 'admin';
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/members?communityId=1' ? members : { groups: [{ community: { id: 1, title: 'FC Altynka' }, role, players }] }));
  (api.send as Mock).mockResolvedValue(members[0]);
});

test('admin edits roles separately from the calculated rating', async () => {
  renderWithApp(<Players />, { me: admin });
  await userEvent.click(await screen.findByRole('button', { name: 'Управление: Арман' }));
  expect(screen.queryByRole('button', { name: '8' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Сделать организатором' }));
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/members/12?communityId=1', { role: 'organizer' });
});

test.each([organizer, player])('all members see decimal ratings and can search players ($role)', async me => {
  role = me.communities[0].role;
  renderWithApp(<Players />, { me });
  expect(await screen.findByText('Арман')).toBeInTheDocument();
  expect(screen.getByText('5,0')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Арман/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Управление: Арман' })).toBeNull();
  await userEvent.type(screen.getByRole('searchbox'), 'Орг');
  expect(screen.queryByText('Арман')).toBeNull();
  expect(screen.getByText('Орг')).toBeInTheDocument();
});

test('admin renaming to a taken name sees why it failed', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(409, 'name_taken'));
  renderWithApp(<Players />, { me: admin });
  await userEvent.click(await screen.findByRole('button', { name: 'Управление: Арман' }));
  const input = screen.getByLabelText('Имя в списках');
  await userEvent.clear(input); await userEvent.type(input, 'Орг');
  await userEvent.click(screen.getByRole('button', { name: 'Имя' }));
  expect(await screen.findByText('Это имя уже занято')).toBeInTheDocument();
});

test('two groups render a titled section each; role management only in the admin section', async () => {
  const other = [{ ...players[0], userId: 30, displayName: 'Тимур' }];
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/members?communityId=2' ? [{ userId: 30, displayName: 'Тимур', role: 'player', level: 5 }] : { groups: [{ community: { id: 1, title: 'FC Altynka' }, role: 'player', players }, { community: { id: 2, title: 'Футбол по средам' }, role: 'admin', players: other }] }));
  renderWithApp(<Players />, { me: { ...player, communities: [{ id: 1, title: 'FC Altynka', role: 'player' }, { id: 2, title: 'Футбол по средам', role: 'admin' }] } });
  expect(await screen.findByRole('heading', { name: /FC Altynka/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Футбол по средам/ })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Управление: Тимур' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Управление: Арман' })).toBeNull();
  expect(api.get).not.toHaveBeenCalledWith('/api/members?communityId=1');
  await userEvent.click(screen.getByRole('button', { name: 'Управление: Тимур' }));
  await userEvent.click(screen.getByRole('button', { name: 'Сделать организатором' }));
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/members/30?communityId=2', { role: 'organizer' });
});

test('a single group has no section heading', async () => {
  renderWithApp(<Players />, { me: player });
  await screen.findByText('Арман');
  expect(screen.queryByRole('heading', { name: /FC Altynka/ })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Игроки' })).toBeInTheDocument();
});
