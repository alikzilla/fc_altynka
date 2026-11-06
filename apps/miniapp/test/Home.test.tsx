import type { EventsListDto, EventSummaryDto } from '@altynka/core';
import { screen, within } from '@testing-library/react';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { Home } from '../src/screens/Home';
import { NotificationsProvider } from '../src/state/notifications';
import userEvent from '@testing-library/user-event';
import { openTelegramLink } from '../src/lib/tg';
import { noGroups, organizer, player, renderWithApp, twoGroups } from './render';

vi.mock('../src/lib/api');
vi.mock('../src/lib/tg');

const ev: EventSummaryDto = {
  id: 5, community: { id: 1, title: 'FC Altynka' }, date: '2026-11-07', status: 'collecting', startTime: null, durationHours: null, place: null,
  limit: 10, mainCount: 9, reserveCount: 2, my: 'reserve',
};

beforeEach(() => {
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [ev], past: [] } satisfies EventsListDto));
});

test('Home shows occupancy and reserve status without offering creation to players', async () => {
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
  expect(await screen.findByRole('heading', { name: 'суббота, 7 ноября' })).toBeInTheDocument();
  expect(screen.getByText(/10 игроков/)).toHaveTextContent('9 / 10 игроков');
  expect(screen.getByText('Резерв: 2')).toBeInTheDocument();
  expect(screen.getByText('Ты в резерве')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Создать матч' })).toBeNull();
});

test('organizers can create a match from the empty home state', async () => {
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [], past: [] }));
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: organizer });
  expect(await screen.findByText('Нет ближайших матчей')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Создать матч' })).toHaveAttribute('href', '/new');
});

test('empty home has one contextual action without decorative tiles or an empty tasks section', async () => {
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [], past: [] }));
  const { container } = renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: organizer });
  const action = await screen.findByRole('link', { name: 'Создать матч' });
  const empty = action.closest('.empty-state');
  expect(empty).not.toBeNull();
  expect(within(empty as HTMLElement).getByRole('link', { name: 'Создать матч' })).toHaveAttribute('href', '/new');
  expect(container.querySelector('.empty-icon')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Нужно сделать' })).not.toBeInTheDocument();
});

test('two groups tag every match card with its group; one group shows no tag', async () => {
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [ev, { ...ev, id: 6, community: { id: 2, title: 'Футбол по средам' } }], past: [] }));
  const { unmount } = renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: twoGroups });
  const cards = await screen.findAllByRole('article');
  expect(within(cards[0]).getByText('FC Altynka')).toBeInTheDocument();
  expect(within(cards[1]).getByText('Футбол по средам')).toBeInTheDocument();
  unmount();
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
  await screen.findAllByRole('article');
  expect(screen.queryByText('FC Altynka')).toBeNull();
});

test('without groups the empty home explains how to connect the bot', async () => {
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [], past: [] }));
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: noGroups });
  expect(await screen.findByText(/Добавь бота в Telegram-группу/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Создать матч' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Добавить в группу' }));
  expect(openTelegramLink).toHaveBeenCalled();
});
