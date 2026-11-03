import type { EventsListDto, EventSummaryDto } from '@sbor/core';
import { screen } from '@testing-library/react';
import type { Mock } from 'vitest';
import { api } from '../src/api';
import { Home } from '../src/screens/Home';
import { organizer, player, renderWithApp } from './render';

vi.mock('../src/api');
vi.mock('../src/tg');

const ev: EventSummaryDto = {
  id: 5, date: '2026-11-07', status: 'collecting', startTime: null, durationHours: null, place: null,
  limit: 10, mainCount: 9, reserveCount: 2, my: 'reserve',
};

beforeEach(() => {
  (api.get as Mock).mockResolvedValue({ active: [ev], past: [] } satisfies EventsListDto);
});

test('Home shows active event with counts and hides "Новый сбор" for players', async () => {
  renderWithApp(<Home />, { me: player });
  expect(await screen.findByText('суббота, 7 ноября')).toBeInTheDocument();
  expect(screen.getByText(/9\/10/)).toBeInTheDocument();
  expect(screen.getByText(/резерв 2/)).toBeInTheDocument();
  expect(screen.getByText('Ты в резерве')).toBeInTheDocument();
  expect(screen.queryByText('Новый сбор')).toBeNull();
});

test('Home shows "Новый сбор" for organizers and an empty state', async () => {
  (api.get as Mock).mockResolvedValue({ active: [], past: [] });
  renderWithApp(<Home />, { me: organizer });
  expect(await screen.findByText('Ближайших сборов нет')).toBeInTheDocument();
  expect(screen.getByText('Новый сбор')).toBeInTheDocument();
});
