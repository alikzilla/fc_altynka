import type { EventDetailDto, SignupDto } from '@altynka/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { Teams } from '../src/screens/Teams';
import { organizer, player, renderWithApp } from './render';

vi.mock('../src/lib/api');
vi.mock('../src/lib/tg');

const s = (id: number, level: number): SignupDto => ({
  id, seq: id, name: `Игрок${id}`, userId: id + 100, guestOfName: null, invitedByUserId: null, level,
});
const main = Array.from({ length: 10 }, (_, i) => s(i + 1, 10 - i));
const ev: EventDetailDto = {
  id: 5, community: { id: 1, title: 'FC Altynka' }, viewerRole: 'organizer', date: '2026-11-07', status: 'scheduled', startTime: '21:00', durationHours: 1, place: null, comment: null,
  limit: 10, mainCount: 10, reserveCount: 0, my: 'main', main, reserve: [], teams: null, bill: null,
};
const team = (name: string) => screen.getByRole('group', { name });
const namesIn = (name: string) => within(team(name)).getAllByRole('button', { name: /Игрок/ }).map(b => b.textContent);

beforeEach(() => (api.send as Mock).mockResolvedValue({ kind: 'ok' }));

test('organizer splits 10 players into 2 teams of 5 with visible sums', async () => {
  renderWithApp(<Teams ev={ev} reload={() => {}} />, { me: organizer });
  await userEvent.click(screen.getByRole('button', { name: 'Поделить' }));
  expect(namesIn('Красные')).toHaveLength(5);
  expect(namesIn('Синие')).toHaveLength(5);
  expect(screen.queryByRole('group', { name: 'Жёлтые' })).toBeNull();
  expect(within(team('Красные')).getByText(/Сумма \d+/)).toBeInTheDocument();
});

test('switching to 3 teams splits into three groups', async () => {
  renderWithApp(<Teams ev={ev} reload={() => {}} />, { me: organizer });
  await userEvent.click(screen.getByRole('button', { name: '3 команды' }));
  await userEvent.click(screen.getByRole('button', { name: 'Поделить' }));
  expect(namesIn('Жёлтые').length).toBeGreaterThan(0);
});

test('tap two players from different teams swaps them', async () => {
  renderWithApp(<Teams ev={ev} reload={() => {}} />, { me: organizer });
  await userEvent.click(screen.getByRole('button', { name: 'Поделить' }));
  const a = namesIn('Красные')[0]!;
  const b = namesIn('Синие')[0]!;
  await userEvent.click(within(team('Красные')).getByRole('button', { name: a }));
  await userEvent.click(within(team('Синие')).getByRole('button', { name: b }));
  expect(namesIn('Красные')).toContain(b);
  expect(namesIn('Синие')).toContain(a);
});

test('publish sends PUT then POST', async () => {
  const reload = vi.fn();
  renderWithApp(<Teams ev={ev} reload={reload} />, { me: organizer });
  await userEvent.click(screen.getByRole('button', { name: 'Поделить' }));
  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать составы' }));
  const calls = (api.send as Mock).mock.calls;
  expect(calls[0][0]).toBe('PUT');
  expect(calls[0][1]).toBe('/api/events/5/teams');
  expect(calls[0][2]).toMatchObject({ teamCount: 2 });
  expect(calls[0][2].refreshRatings).toBe(true);
  expect(calls[0][2].ratingSnapshot).toEqual(Object.fromEntries(main.map(m => [m.id, m.level])));
  expect(calls[0][2].teams.flat().sort((x: number, y: number) => x - y)).toEqual(main.map(m => m.id));
  expect(calls[1]).toEqual(['POST', '/api/events/5/teams/publish']);
  expect(reload).toHaveBeenCalled();
});

test('republishing saved teams preserves the reviewed snapshot until a new split is generated', async () => {
  const ratingSnapshot = Object.fromEntries(main.map(m => [m.id, 5]));
  const saved = { ...ev, teams: { teamCount: 2 as const, teams: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]], publishedAt: 1, stale: false, ratingSnapshot } };
  renderWithApp(<Teams ev={saved} reload={() => {}} />, { me: organizer });
  expect(screen.getAllByText('Сумма 25,0')).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать составы' }));
  expect(api.send).toHaveBeenCalledWith('PUT', '/api/events/5/teams', expect.objectContaining({ refreshRatings: false, ratingSnapshot }));
  await userEvent.click(screen.getByRole('button', { name: 'Поделить' }));
  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать составы' }));
  expect(api.send).toHaveBeenCalledWith('PUT', '/api/events/5/teams', expect.objectContaining({ refreshRatings: true, ratingSnapshot: Object.fromEntries(main.map(m => [m.id, m.level])) }));
});

test('player sees published teams without levels', () => {
  const pub = { ...ev, main: main.map(({ level: _l, ...rest }) => rest), teams: { teamCount: 2 as const, teams: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]], publishedAt: 1, stale: false } };
  renderWithApp(<Teams ev={pub} reload={() => {}} />, { me: player });
  expect(within(team('Красные')).getByText('Игрок1')).toBeInTheDocument();
  expect(screen.queryByText(/Сумма/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Поделить' })).toBeNull();
});

test('player sees a placeholder before publication', () => {
  renderWithApp(<Teams ev={ev} reload={() => {}} />, { me: player });
  expect(screen.getByText('Составы ещё не опубликованы')).toBeInTheDocument();
});

test('stale banner', () => {
  renderWithApp(<Teams ev={{ ...ev, teams: { teamCount: 2, teams: [[1, 2, 3, 4, 5], [6, 7, 8, 9]], publishedAt: 1, stale: true } }} reload={() => {}} />, { me: organizer });
  expect(screen.getByText(/Состав изменился/)).toBeInTheDocument();
});
