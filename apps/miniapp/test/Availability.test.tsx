import { availabilityDates, formatDateRu, todayAlmaty, type AvailabilityDto, type AvailabilitySummaryDto } from '@altynka/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { queryClient, shouldRefresh } from '../src/lib/queryClient';
import { AvailabilitySheet } from '../src/screens/Availability';
import { NewEvent } from '../src/screens/NewEvent';
import { organizer, player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

const dates = availabilityDates('2026-11-11');
const empty = (): AvailabilityDto => ({ days: dates.map(date => ({ date, mark: null })) });

beforeEach(() => { queryClient.clear(); });

test('«не могу» saves at once; «могу» is saved only together with a time window', async () => {
  (api.get as Mock).mockResolvedValue(empty());
  (api.send as Mock).mockImplementation(async (_m, _p, body) => ({ days: empty().days.map((d, i) => i === 1 ? { ...d, mark: body.mark } : d) }));
  renderWithApp(<AvailabilitySheet onClose={() => {}} />, { me: player });
  const grid = await screen.findByRole('group', { name: 'Ближайшие 7 дней' });
  expect(within(grid).getAllByRole('button')).toHaveLength(7);
  await userEvent.click(within(grid).getByRole('button', { name: 'четверг, 12 ноября — не указано' }));
  const editor = screen.getByRole('region', { name: 'Четверг, 12 ноября' });
  expect(within(editor).getByRole('button', { name: 'Не указано' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(within(editor).getByRole('button', { name: 'Не могу' }));
  expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/availability/days/2026-11-12', { mark: { status: 'no', parts: [] } });
  expect(await within(grid).findByRole('button', { name: 'четверг, 12 ноября — не могу' })).toBeInTheDocument();
  expect(within(editor).queryByRole('group', { name: 'Время' })).toBeNull();

  // «Могу» снимает прежнюю отметку и ждёт времени: без окна день остаётся неотмеченным.
  await userEvent.click(within(editor).getByRole('button', { name: 'Могу' }));
  expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/availability/days/2026-11-12', { mark: null });
  expect(within(editor).getByText('Выбери время, и отметка сохранится.')).toBeInTheDocument();
  expect(within(editor).getByRole('button', { name: 'Могу' })).toHaveAttribute('aria-pressed', 'true');
  expect(await within(grid).findByRole('button', { name: 'четверг, 12 ноября — не указано' })).toBeInTheDocument();
  const times = within(editor).getByRole('group', { name: 'Время' });
  expect(within(times).getAllByRole('button').map(b => b.textContent)).toEqual(['До 12:00', '12:00–15:00', '15:00–18:00', '18:00–20:00', '20:00–22:00', 'После 22:00', 'Весь день']);
  await userEvent.click(within(times).getByRole('button', { name: '20:00–22:00' }));
  expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/availability/days/2026-11-12', { mark: { status: 'yes', parts: ['night'] } });
  expect(within(editor).queryByText('Выбери время, и отметка сохранится.')).toBeNull();
  await userEvent.click(within(times).getByRole('button', { name: '18:00–20:00' }));
  expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/availability/days/2026-11-12', { mark: { status: 'yes', parts: ['evening', 'night'] } });
  expect(await within(grid).findByRole('button', { name: 'четверг, 12 ноября — могу · 18:00–20:00, 20:00–22:00' })).toBeInTheDocument();

  await userEvent.click(within(times).getByRole('button', { name: 'Весь день' }));
  expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/availability/days/2026-11-12', { mark: { status: 'yes', parts: ['morning', 'noon', 'afternoon', 'evening', 'night', 'late'] } });
  // Снято последнее окно: отметка убирается, «Могу» снова ждёт времени.
  await userEvent.click(within(times).getByRole('button', { name: 'Весь день' }));
  expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/availability/days/2026-11-12', { mark: null });
  expect(within(editor).getByText('Выбери время, и отметка сохранится.')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Обычный график' })).toBeNull();
});

test('a failed save says so and reloads the calendar', async () => {
  (api.get as Mock).mockResolvedValue(empty());
  (api.send as Mock).mockRejectedValue(new Error('offline'));
  renderWithApp(<AvailabilitySheet onClose={() => {}} />, { me: player });
  await userEvent.click(within(await screen.findByRole('region', { name: 'Среда, 11 ноября' })).getByRole('button', { name: 'Не могу' }));
  expect(await screen.findByText('Не получилось сохранить. Попробуй ещё раз.')).toBeInTheDocument();
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('button', { name: 'среда, 11 ноября — не указано' })).toBeInTheDocument();
});

// Лист создания сверяет дату с настоящим «сегодня», поэтому сводка считается от него.
const upcoming = availabilityDates(todayAlmaty(new Date()));
const summary = (): AvailabilitySummaryDto => ({ community: { id: 1, title: 'FC Altynka' }, days: upcoming.map((date, i) => ({
  date, unknown: 4,
  yes: i === 3 ? [{ userId: 5, name: 'Тимур', parts: ['evening', 'night'] }, { userId: 6, name: 'Ерлан', parts: ['night'] }] : [],
  no: i === 3 ? [{ userId: 7, name: 'Данияр', parts: [] }] : [],
})) });

test('the organizer picks the match date from who can play', async () => {
  (api.get as Mock).mockResolvedValue(summary());
  (api.send as Mock).mockResolvedValue({ id: 5 });
  renderWithApp(<NewEvent onClose={() => {}} />, { me: organizer });
  expect(api.get).toHaveBeenCalledWith('/api/availability/summary?communityId=1', expect.anything());
  const region = await screen.findByRole('region', { name: 'Кто может играть' });
  await userEvent.click(within(region).getByRole('button', { name: `${formatDateRu(upcoming[3])} — могут 2` }));
  const rows = within(within(region).getByRole('list', { name: 'Кто может по времени' })).getAllByRole('listitem').map(li => li.textContent);
  expect(rows).toEqual(['До 12:000никто', '12:00–15:000никто', '15:00–18:000никто', '18:00–20:001Тимур', '20:00–22:002Тимур, Ерлан', 'После 22:000никто']);
  expect(within(region).getByText(/Данияр/)).toBeInTheDocument();
  expect(screen.getByLabelText('Дата')).toHaveValue(upcoming[3]);
  await userEvent.click(screen.getByRole('button', { name: 'Создать матч' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events', expect.objectContaining({ date: upcoming[3] }));
});

test('an unused calendar leaves a single hint in the new match sheet', async () => {
  (api.get as Mock).mockResolvedValue({ ...summary(), days: summary().days.map(d => ({ ...d, yes: [], no: [] })) });
  renderWithApp(<NewEvent onClose={() => {}} />, { me: organizer });
  expect(await screen.findByText(/Игроки пока не отметили/)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Кто может играть' })).toBeNull();
});

test('a calendar write refreshes only calendar reads', () => {
  expect(shouldRefresh('/api/availability/days/2026-11-12', '/api/availability')).toBe(true);
  expect(shouldRefresh('/api/availability/days/2026-11-12', '/api/availability/summary?communityId=1')).toBe(true);
  expect(shouldRefresh('/api/availability/days/2026-11-12', '/api/events')).toBe(false);
  expect(shouldRefresh('/api/availability/days/2026-11-12', '/api/me')).toBe(false);
});
