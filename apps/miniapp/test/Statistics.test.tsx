import type { LeaderboardDto, LeaderboardRowDto } from '@altynka/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { Statistics } from '../src/screens/Statistics';
import { player, renderWithApp, twoGroups } from './render';

vi.mock('../src/lib/api');
vi.mock('../src/lib/tg');

const row = (userId: number, displayName: string, over: Partial<LeaderboardRowDto> = {}): LeaderboardRowDto =>
  ({ userId, displayName, photoUrl: null, rating: 6.5, meetings: 2, games: 8, goals: 0, assists: 0, assistsTracked: true, wins: 1, ...over });
const first = { community: { id: 1, title: 'FC Altynka' }, players: [row(2, 'Игрок', { goals: 5, assists: 1 }), row(3, 'Дамир', { goals: 9, assistsTracked: false }), row(4, 'Ернар', { goals: 4, assists: 6 }), row(5, 'Тимур', { goals: 1 })] };
const second = { community: { id: 2, title: 'Футбол по средам' }, players: [row(2, 'Игрок', { goals: 6, assists: 2 }), row(6, 'Бекзат', { goals: 3 })] };
let data: LeaderboardDto;
beforeEach(() => {
  data = { groups: [first, second] };
  (api.get as Mock).mockImplementation((path: string) => path === '/api/statistics' ? Promise.resolve(data) : new Promise(() => {}));
});
const podium = () => within(screen.getByRole('list', { name: /Лидеры/ })).getAllByRole('button').map(b => b.textContent);
const table = () => within(screen.getByRole('list', { name: /Таблица/ })).getAllByRole('button').map(b => b.textContent);

test('all players are merged across groups and ranked by goals with a medal podium', async () => {
  renderWithApp(<Statistics />, { me: twoGroups });
  expect(await screen.findByRole('button', { name: 'Все игроки' })).toHaveAttribute('aria-pressed', 'true');
  expect(podium()).toEqual(['1 местоИИгрок11', '2 местоДДамир9', '3 местоЕЕрнар4']);
  expect(screen.getByRole('list', { name: /Лидеры/ }).querySelectorAll('[data-medal]')).toHaveLength(3);
  expect(table()).toEqual(['4ББекзат2 матча · рейтинг 6,53', '5ТТимур2 матча · рейтинг 6,51']);
});

test('a group chip and a board change the table; unknown assists show a dash', async () => {
  renderWithApp(<Statistics />, { me: twoGroups });
  await userEvent.click(await screen.findByRole('button', { name: 'FC Altynka' }));
  await userEvent.click(screen.getByRole('button', { name: 'Пасы' }));
  expect(podium().map(text => text!.replace(/^\d место./, ''))).toEqual(['Ернар6', 'Игрок1', 'Тимур0']);
  expect(table()).toEqual(['4ДДамир2 матча · рейтинг 6,5—']);
  await userEvent.click(screen.getByRole('button', { name: 'Футбол по средам' }));
  expect(screen.queryByRole('list', { name: /Лидеры/ })).toBeNull();
  expect(table()).toHaveLength(2);
});

test('one group has no filter; no played games gives an empty state', async () => {
  data = { groups: [{ ...first, players: [] }] };
  renderWithApp(<Statistics />, { me: player });
  expect(await screen.findByRole('heading', { name: 'Статистики пока нет' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Все игроки' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Голы' })).toHaveAttribute('aria-pressed', 'true');
});

test('a row opens that player profile in a sheet', async () => {
  renderWithApp(<Statistics />, { me: twoGroups });
  await userEvent.click(await screen.findByRole('button', { name: /Бекзат/ }));
  expect(screen.getByRole('dialog', { name: 'Профиль игрока' })).toBeInTheDocument();
  expect((api.get as Mock).mock.calls.map(call => call[0])).toContain('/api/players/6');
});
