import type { VenueDto } from '@altynka/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { Venues } from '../src/screens/Venues';
import { noGroups, organizer, player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

const manege: VenueDto = { id: 1, name: 'Манеж Арена', address: 'Толе би, 1', mapUrl: 'https://go.2gis.com/abc', hourlyRate: 25000 };
const school: VenueDto = { id: 2, name: 'Школа Аксай', address: null, mapUrl: null, hourlyRate: null };
let venues: Record<number, VenueDto[]>;
beforeEach(() => {
  venues = { 1: [manege, school], 2: [] };
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve({ venues: venues[Number(new URL(path, 'http://x').searchParams.get('communityId'))] ?? [] }));
});

test('a player sees address, map link and price, without management', async () => {
  renderWithApp(<Venues />, { me: player });
  const card = (await screen.findByRole('heading', { name: 'Манеж Арена' })).closest('li')!;
  expect(within(card).getByText('Толе би, 1')).toBeInTheDocument();
  expect(within(card).getByRole('link', { name: /Открыть в 2ГИС/ })).toHaveAttribute('href', manege.mapUrl);
  expect(within(card).getByText(/25\s000 ₸ \/ час/)).toBeInTheDocument();
  const other = screen.getByRole('heading', { name: 'Школа Аксай' }).closest('li')!;
  expect(within(other).getByText('Адрес уточняется')).toBeInTheDocument();
  expect(within(other).getByText('Цена уточняется')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Добавить площадку/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Изменить площадку/ })).toBeNull();
});

test('an organizer adds, edits and deletes a venue', async () => {
  renderWithApp(<Venues />, { me: organizer });
  await screen.findByRole('heading', { name: 'Манеж Арена' });
  const created: VenueDto = { id: 3, name: 'Поле у реки', address: null, mapUrl: null, hourlyRate: 18000 };
  (api.send as Mock).mockResolvedValueOnce({ venue: created, venues: [manege, school, created] });
  await userEvent.click(screen.getByRole('button', { name: 'Добавить площадку' }));
  let sheet = screen.getByRole('dialog', { name: 'Новая площадка' });
  await userEvent.type(within(sheet).getByLabelText('Название'), 'Поле у реки');
  await userEvent.type(within(sheet).getByLabelText(/Цена за час/), '18000');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Добавить площадку' }));
  expect(api.send).toHaveBeenLastCalledWith('POST', '/api/venues?communityId=1', { name: 'Поле у реки', address: null, mapUrl: null, hourlyRate: 18000 });
  expect(await screen.findByRole('heading', { name: 'Поле у реки' })).toBeInTheDocument();

  (api.send as Mock).mockResolvedValueOnce({ venue: { ...school, address: 'Аксай-4, 70' }, venues: [manege, { ...school, address: 'Аксай-4, 70' }, created] });
  await userEvent.click(screen.getByRole('button', { name: 'Изменить площадку Школа Аксай' }));
  sheet = screen.getByRole('dialog', { name: 'Площадка' });
  expect(within(sheet).getByLabelText('Название')).toHaveValue('Школа Аксай');
  await userEvent.type(within(sheet).getByLabelText(/Адрес/), 'Аксай-4, 70');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Сохранить' }));
  expect(api.send).toHaveBeenLastCalledWith('PATCH', '/api/venues/2', { name: 'Школа Аксай', address: 'Аксай-4, 70', mapUrl: null, hourlyRate: null });
  expect(await screen.findByText('Аксай-4, 70')).toBeInTheDocument();

  (api.send as Mock).mockResolvedValueOnce({ venues: [school, created] });
  await userEvent.click(screen.getByRole('button', { name: 'Удалить площадку Манеж Арена' }));
  expect(api.send).toHaveBeenCalledTimes(2);
  await userEvent.click(within(screen.getByRole('group', { name: 'Удалить площадку Манеж Арена?' })).getByRole('button', { name: 'Удалить' }));
  expect(api.send).toHaveBeenLastCalledWith('DELETE', '/api/venues/1');
  expect(screen.queryByRole('heading', { name: 'Манеж Арена' })).toBeNull();
});

test('several groups get their own sections; only the organized one can be managed', async () => {
  renderWithApp(<Venues />, { me: { ...organizer, communities: [{ id: 1, title: 'FC Altynka', role: 'player' }, { id: 2, title: 'Футбол по средам', role: 'organizer' }] } });
  const first = await screen.findByRole('region', { name: 'FC Altynka' });
  expect(await within(first).findByRole('heading', { name: 'Манеж Арена' })).toBeInTheDocument();
  expect(within(first).queryByRole('button', { name: /Добавить площадку/ })).toBeNull();
  const second = screen.getByRole('region', { name: 'Футбол по средам' });
  expect(await within(second).findByRole('heading', { name: 'Площадок пока нет' })).toBeInTheDocument();
  expect(within(second).getByText(/Добавь поле, где вы играете/)).toBeInTheDocument();
  expect(within(second).getByRole('button', { name: 'Добавить площадку: Футбол по средам' })).toBeInTheDocument();
});

test('without a group the page explains how to connect one', async () => {
  renderWithApp(<Venues />, { me: noGroups });
  expect(screen.getByRole('heading', { name: 'Площадок пока нет' })).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});
