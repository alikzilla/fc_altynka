import { availabilityDates, emptyWeekly, formatDateRu, todayAlmaty, weekdayOf, type AvailabilityDto, type AvailabilitySummaryDto } from '@altynka/core';
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
const empty = (): AvailabilityDto => ({ weekly: emptyWeekly(), days: dates.map(date => ({ date, mark: null, override: false })) });

beforeEach(() => { queryClient.clear(); });

test('a day is marked «не могу» at once and saved; «могу» offers parts of the day', async () => {
  (api.get as Mock).mockResolvedValue(empty());
  (api.send as Mock).mockImplementation(async (_m, _p, body) => ({ ...empty(), days: empty().days.map((d, i) => i === 1 ? { ...d, mark: body.mark, override: true } : d) }));
  renderWithApp(<AvailabilitySheet onClose={() => {}} />, { me: player });
  const grid = await screen.findByRole('group', { name: 'Ближайшие 7 дней' });
  expect(within(grid).getAllByRole('button')).toHaveLength(7);
  await userEvent.click(within(grid).getByRole('button', { name: 'четверг, 12 ноября — не указано' }));
  const editor = screen.getByRole('region', { name: 'Четверг, 12 ноября' });
  expect(within(editor).getByRole('button', { name: 'Как обычно' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(within(editor).getByRole('button', { name: 'Не могу' }));
  expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/availability/days/2026-11-12', { mark: { status: 'no', parts: [] } });
  expect(await within(grid).findByRole('button', { name: 'четверг, 12 ноября — не могу' })).toBeInTheDocument();
  expect(within(editor).queryByRole('group', { name: 'Удобное время' })).toBeNull();

  await userEvent.click(within(editor).getByRole('button', { name: 'Могу' }));
  await userEvent.click(within(within(editor).getByRole('group', { name: 'Удобное время' })).getByRole('button', { name: 'Вечер' }));
  expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/availability/days/2026-11-12', { mark: { status: 'yes', parts: ['evening'] } });
  await userEvent.click(within(editor).getByRole('button', { name: 'Как обычно' }));
  expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/availability/days/2026-11-12', { mark: null });
});

test('the weekly pattern is saved whole and fills days without their own mark', async () => {
  (api.get as Mock).mockResolvedValue(empty());
  (api.send as Mock).mockImplementation(async () => new Promise(() => {}));
  renderWithApp(<AvailabilitySheet onClose={() => {}} />, { me: player });
  const week = await screen.findByRole('group', { name: 'Обычный график' });
  await userEvent.click(within(week).getByRole('button', { name: 'Суббота — не указано' }));
  await userEvent.click(within(screen.getByRole('region', { name: 'Суббота' })).getByRole('button', { name: 'Могу' }));
  const weekly = emptyWeekly();
  weekly[5] = { status: 'yes', parts: [] };
  expect(api.send).toHaveBeenLastCalledWith('PUT', '/api/availability/weekly', { weekly });
  const saturdays = dates.filter(d => weekdayOf(d) === 5);
  expect(saturdays).toHaveLength(1);
  expect(await screen.findAllByRole('button', { name: /^суббота, \d+ ноября — могу$/ })).toHaveLength(1);
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
  yes: i === 3 ? [{ userId: 5, name: 'Тимур', parts: ['evening'] }, { userId: 6, name: 'Ерлан', parts: [] }] : [],
  no: i === 3 ? [{ userId: 7, name: 'Данияр', parts: [] }] : [],
})) });

test('the organizer picks the match date from who can play', async () => {
  (api.get as Mock).mockResolvedValue(summary());
  (api.send as Mock).mockResolvedValue({ id: 5 });
  renderWithApp(<NewEvent onClose={() => {}} />, { me: organizer });
  expect(api.get).toHaveBeenCalledWith('/api/availability/summary?communityId=1', expect.anything());
  const region = await screen.findByRole('region', { name: 'Кто может играть' });
  await userEvent.click(within(region).getByRole('button', { name: `${formatDateRu(upcoming[3])} — могут 2` }));
  expect(within(region).getByText(/Тимур \(вечер\), Ерлан/)).toBeInTheDocument();
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
  expect(shouldRefresh('/api/availability/weekly', '/api/availability/summary?communityId=1')).toBe(true);
  expect(shouldRefresh('/api/availability/weekly', '/api/events')).toBe(false);
  expect(shouldRefresh('/api/availability/weekly', '/api/me')).toBe(false);
});
