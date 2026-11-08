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

test('the big match cards carry no group tag, even with two groups', async () => {
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [ev, { ...ev, id: 6, community: { id: 2, title: 'Футбол по средам' } }], past: [] }));
  const { unmount } = renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: twoGroups });
  const cards = await screen.findAllByRole('article');
  expect(within(cards[0]).queryByText('FC Altynka')).toBeNull();
  expect(within(cards[1]).queryByText('Футбол по средам')).toBeNull();
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

test('a match played yesterday leads Home with the player result, payment and survey', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T09:00:00Z'));
  const finished: EventSummaryDto = { ...ev, id: 9, date: '2026-11-07', status: 'billing', place: 'Arena', my: 'main', protocolVersion: 1, startedAt: 1, completedAt: 2,
    myResult: { teamIndex: 1, teamCount: 3, teamRank: 1, colors: ['red', 'blue', 'yellow'], games: 6, goals: 2, wins: 4, draws: 1, losses: 1 } };
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications'
    ? { tasks: [{ kind: 'payment', id: 'p9', eventId: 9, billId: 3, date: '2026-11-07', place: 'Arena', due: 2000, receiverName: 'Орг', receiverKaspiPhone: '+77071234567', community: ev.community },
        { kind: 'review', id: 'r9', eventId: 9, date: '2026-11-07', place: 'Arena', closesAt: 0, community: ev.community }] }
    : { active: [finished], past: [] }));
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
  const card = await screen.findByRole('article', { name: 'Синие — первое место' });
  expect(within(card).getByText('4')).toBeInTheDocument();
  expect(within(card).getByText('твоих гола')).toBeInTheDocument();
  expect(await within(card).findByRole('link', { name: /Оплатить 2\s000/ })).toHaveAttribute('href', '/event/9?tab=bill');
  expect(within(card).getByRole('link', { name: /Оценить матч/ })).toHaveAttribute('href', '/event/9/review');
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Последний матч');
  expect(screen.queryByRole('heading', { name: 'Нужно сделать' })).toBeNull();
  vi.useRealTimers();
});

test('list rows show the personal signup status', async () => {
  const later: EventSummaryDto = { ...ev, id: 6, date: '2026-11-14', my: 'main' };
  const third: EventSummaryDto = { ...ev, id: 7, date: '2026-11-21', my: null, mainCount: 4 };
  (api.get as Mock).mockImplementation((path: string) => Promise.resolve(path === '/api/notifications' ? { tasks: [] } : { active: [ev, later, third], past: [] }));
  renderWithApp(<NotificationsProvider><Home /></NotificationsProvider>, { me: player });
  const section = await screen.findByRole('region', { name: 'Дальше играем' });
  expect(within(section).getByText('В основе')).toBeInTheDocument();
  expect(within(section).getByLabelText('Записано 4 из 10')).toHaveTextContent('4/10');
});
