import type { EventDetailDto } from '@altynka/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/api';
import { EventList } from '../src/screens/EventList';
import { organizer, player, renderWithApp } from './render';

vi.mock('../src/api');
vi.mock('../src/tg');

const s = (id: number, name: string, extra: Partial<EventDetailDto['main'][number]> = {}) => ({
  id, seq: id, name, userId: id + 100, guestOfName: null, invitedByUserId: null, manual: false, ...extra,
});

const ev: EventDetailDto = {
  id: 5, date: '2026-11-07', status: 'collecting', startTime: null, durationHours: null, place: null, comment: null,
  limit: 10, mainCount: 2, reserveCount: 1, my: null,
  main: [s(1, 'Азамат'), s(2, 'Ержан', { userId: null, guestOfName: 'Тимур', invitedByUserId: 7 })],
  reserve: [s(3, 'Арман')],
  teams: null, bill: null,
};

beforeEach(() => {
  (api.send as Mock).mockResolvedValue({ kind: 'main', position: 3, restored: false });
});

test('EventList shows numbered main, guest label and reserve', () => {
  renderWithApp(<EventList ev={ev} reload={() => {}} />, { me: player });
  expect(screen.getByText('Азамат')).toBeInTheDocument();
  expect(screen.getByText('(друг: Тимур)')).toBeInTheDocument();
  expect(screen.getByText('Резерв')).toBeInTheDocument();
  expect(screen.queryByText('Убрать')).toBeNull();
});

test('EventList: "Иду" posts join and reloads', async () => {
  const reload = vi.fn();
  renderWithApp(<EventList ev={ev} reload={reload} />, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Иду' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events/5/join');
  expect(reload).toHaveBeenCalled();
  expect(await screen.findByText('Ты №3 в основе')).toBeInTheDocument();
});

test('EventList: "Не иду" when signed up', async () => {
  renderWithApp(<EventList ev={{ ...ev, my: 'main' }} reload={() => {}} />, { me: player });
  expect(screen.queryByRole('button', { name: 'Иду' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Не иду' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events/5/leave');
});

test('EventList: remove needs two taps', async () => {
  renderWithApp(<EventList ev={ev} reload={() => {}} />, { me: organizer });
  const first = screen.getAllByRole('button', { name: 'Убрать' })[0];
  await userEvent.click(first);
  expect(first).toHaveTextContent('Точно убрать?');
  expect(api.send).not.toHaveBeenCalled();
  await userEvent.click(first);
  expect(api.send).toHaveBeenCalledWith('DELETE', '/api/signups/1');
});

test('EventList: organizer promotes from reserve and sees schedule button', async () => {
  const { history } = renderWithApp(<EventList ev={ev} reload={() => {}} />, { me: organizer });
  await userEvent.click(screen.getByRole('button', { name: 'В основу' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/signups/3/promote');
  await userEvent.click(screen.getByRole('button', { name: 'Назначить игру' }));
  expect(history.at(-1)).toBe('/event/5/schedule');
});

test('EventList: closed list has no join buttons', () => {
  renderWithApp(<EventList ev={{ ...ev, status: 'billing' }} reload={() => {}} />, { me: organizer });
  expect(screen.queryByRole('button', { name: 'Иду' })).toBeNull();
  expect(screen.queryByText('Убрать')).toBeNull();
});
