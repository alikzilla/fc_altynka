import { availabilityDates, emptyWeekly, todayAlmaty, weekStart, type AvailabilityDto } from '@altynka/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { AvailabilityPrompt } from '../src/components/AvailabilityPrompt';
import { api } from '../src/lib/api';
import { queryClient } from '../src/lib/queryClient';
import { noGroups, player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

const today = todayAlmaty(new Date());
const calendar = (marked: number): AvailabilityDto => ({ weekly: emptyWeekly(), days: availabilityDates(today).map((date, i) => ({ date, mark: i < marked ? { status: 'yes', parts: [] } : null, override: i < marked })) });
const key = `altynka:availability-prompt:${player.userId}`;
const dialog = () => screen.queryByRole('dialog', { name: 'Когда сможешь играть?' });

beforeEach(() => { localStorage.clear(); queryClient.clear(); (api.get as Mock).mockReset(); });

test('Home asks to mark the week and leads to the calendar; the answer holds for the week', async () => {
  (api.get as Mock).mockResolvedValue(calendar(2));
  const view = renderWithApp(<AvailabilityPrompt />, { me: player, path: '/' });
  await userEvent.click(await screen.findByRole('button', { name: 'Отметить дни' }));
  expect(view.history.at(-1)).toBe('/profile/availability');
  expect(dialog()).toBeNull();
  expect(localStorage.getItem(key)).toBe(weekStart(today));
  view.unmount();
  renderWithApp(<AvailabilityPrompt />, { me: player, path: '/' });
  expect(dialog()).toBeNull();
  expect(api.get).toHaveBeenCalledTimes(1);
});

test('«Позже» closes it until next week; an answer from an earlier week no longer counts', async () => {
  (api.get as Mock).mockResolvedValue(calendar(0));
  localStorage.setItem(key, '2020-01-06');
  renderWithApp(<AvailabilityPrompt />, { me: player, path: '/' });
  await userEvent.click(await screen.findByRole('button', { name: 'Позже' }));
  expect(dialog()).toBeNull();
  expect(localStorage.getItem(key)).toBe(weekStart(today));
});

test('a fully marked week, another screen, no group or pending skills keep it away', async () => {
  (api.get as Mock).mockResolvedValue(calendar(7));
  renderWithApp(<AvailabilityPrompt />, { me: player, path: '/' });
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(dialog()).toBeNull();

  (api.get as Mock).mockClear().mockResolvedValue(calendar(0));
  queryClient.clear();
  renderWithApp(<AvailabilityPrompt />, { me: player, path: '/matches' });
  renderWithApp(<AvailabilityPrompt />, { me: noGroups, path: '/' });
  renderWithApp(<AvailabilityPrompt />, { me: { ...player, rating: { value: 5, initial: 5, selfAssessment: null, matchesCount: 0 } } as typeof player, path: '/' });
  expect(api.get).not.toHaveBeenCalled();
  expect(dialog()).toBeNull();
});
