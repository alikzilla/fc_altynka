import type { EventDetailDto } from '@altynka/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { EventList } from '../src/screens/EventList';
import { MatchParticipation } from '../src/screens/MatchParticipation';
import { organizer, player, renderWithApp } from './render';

function MatchList(p: { ev: EventDetailDto; reload: () => void }) { return <><MatchParticipation {...p} /><EventList {...p} /></>; }

vi.mock('../src/lib/api');
vi.mock('../src/lib/tg');

const s = (id: number, name: string, extra: Partial<EventDetailDto['main'][number]> = {}) => ({
  id, seq: id, name, userId: id + 100, guestOfName: null, invitedByUserId: null, ...extra,
});

const ev: EventDetailDto = {
  id: 5, community: { id: 1, title: 'FC Altynka' }, viewerRole: 'organizer', date: '2026-11-07', status: 'collecting', startTime: null, durationHours: null, place: null, comment: null,
  limit: 10, mainCount: 2, reserveCount: 1, my: null,
  main: [s(1, 'Азамат'), s(2, 'Ержан', { userId: null, guestOfName: 'Тимур', invitedByUserId: 7 })],
  reserve: [s(3, 'Арман')],
  teams: null, bill: null,
};

beforeEach(() => {
  (api.send as Mock).mockResolvedValue({ kind: 'main', position: 3, restored: false });
});

test('EventList shows numbered main, guest label and reserve', () => {
  renderWithApp(<MatchList ev={ev} reload={() => {}} />, { me: player });
  expect(screen.getByText('Азамат')).toBeInTheDocument();
  expect(screen.getByText('(друг: Тимур)')).toBeInTheDocument();
  expect(screen.getByText('Резерв')).toBeInTheDocument();
  expect(screen.queryByText('Убрать')).toBeNull();
});

test('EventList: "Иду" posts join and reloads', async () => {
  const reload = vi.fn();
  renderWithApp(<MatchList ev={ev} reload={reload} />, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Иду' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events/5/join');
  expect(reload).toHaveBeenCalled();
  expect(await screen.findByText('Ты в основе')).toBeInTheDocument();
});

test('EventList: "Не иду" when signed up', async () => {
  renderWithApp(<MatchList ev={{ ...ev, my: 'main' }} reload={() => {}} />, { me: player });
  expect(screen.queryByRole('button', { name: 'Иду' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Изменить' }));
  await userEvent.click(screen.getByRole('button', { name: 'Не иду, выйти из списка' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events/5/leave');
});

test('EventList: remove needs two taps', async () => {
  renderWithApp(<MatchList ev={ev} reload={() => {}} />, { me: organizer });
  await userEvent.click(screen.getByRole('button', { name: 'Действия: Азамат' }));
  const first = screen.getByRole('button', { name: 'Убрать из списка' });
  await userEvent.click(first);
  expect(first).toHaveTextContent('Точно убрать?');
  expect(api.send).not.toHaveBeenCalled();
  await userEvent.click(first);
  expect(api.send).toHaveBeenCalledWith('DELETE', '/api/signups/1');
});

test('EventList: organizer cannot move a reservist out of turn and sees schedule button', async () => {
  const { history } = renderWithApp(<MatchList ev={ev} reload={() => {}} />, { me: organizer });
  expect(screen.queryByRole('button', { name: 'В основу' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Назначить матч' }));
  expect(history.at(-1)).toBe('/event/5/schedule');
});

test('EventList: closed list has no join buttons', () => {
  renderWithApp(<MatchList ev={{ ...ev, status: 'billing' }} reload={() => {}} />, { me: organizer });
  expect(screen.queryByRole('button', { name: 'Иду' })).toBeNull();
  expect(screen.queryByText('Убрать')).toBeNull();
});

test('joining blocks repeated requests and recovers after a failure', async () => {
  let fail!: (error: Error) => void;
  (api.send as Mock).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
  renderWithApp(<MatchList ev={ev} reload={() => {}} />, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Иду' }));
  const pending = screen.getByRole('button', { name: 'Записываем…' });
  expect(pending).toBeDisabled();
  await userEvent.click(pending);
  expect(api.send).toHaveBeenCalledTimes(1);
  fail(new Error('offline'));
  expect(await screen.findByRole('button', { name: 'Иду' })).toBeEnabled();
});
