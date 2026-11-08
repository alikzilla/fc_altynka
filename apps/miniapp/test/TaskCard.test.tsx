import type { NotificationTaskDto } from '@altynka/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { copy, openLink } from '../src/lib/tg';
import { queryClient } from '../src/lib/queryClient';
import { TaskCard } from '../src/components/TaskCard';
import { GroupTag } from '../src/components/GroupTag';
import { RatingHistory } from '../src/components/PlayerRating';
import { player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

const payment = (communityId: number, title: string): NotificationTaskDto => ({
  kind: 'payment', id: 'payment:31', eventId: 5, billId: 3, date: '2026-11-07', place: 'Арена', due: 2500,
  receiverName: 'Орг Б', receiverKaspiPhone: '+77071234567', community: { id: communityId, title },
});

test('debt of a group the person left is paid from the card, without the match page', async () => {
  (api.send as Mock).mockResolvedValue({ kind: 'ok' });
  (copy as Mock).mockResolvedValue(true);
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  renderWithApp(<TaskCard task={payment(7, 'Старая команда')} />, { me: player });
  expect(screen.getByText('Старая команда')).toBeVisible();
  expect(screen.getByText('Орг Б')).toBeVisible();
  expect(screen.getByText(/\+7 707 123 45 67/)).toBeVisible();
  expect(screen.getByRole('button', { name: /Скопировать сумму/ })).toHaveTextContent('2 500 ₸');
  expect(document.querySelector('a[href^="/event/"]')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Перевести в Kaspi' }));
  expect(copy).toHaveBeenCalledWith('+77071234567');
  expect(openLink).toHaveBeenCalledWith('https://kaspi.kz/');
  await userEvent.click(screen.getByRole('button', { name: 'Я перевёл' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/bills/3/paid');
  expect(invalidate).toHaveBeenCalledWith({ queryKey: expect.arrayContaining(['/api/notifications']) });
});

test('compact card of a left group does not link to the match', () => {
  renderWithApp(<TaskCard task={payment(7, 'Старая команда')} compact />, { me: player });
  expect(document.querySelector('a[href^="/event/"]')).toBeNull();
  expect(screen.getByRole('link')).toHaveAttribute('href', '/notifications');
});

test('debt of a current group still opens the match bill', () => {
  renderWithApp(<TaskCard task={payment(1, 'FC Altynka')} />, { me: player });
  expect(screen.getByRole('link', { name: /Перейти к оплате/ })).toHaveAttribute('href', '/event/5?tab=bill');
  expect(screen.queryByRole('button', { name: 'Я перевёл' })).toBeNull();
});

test('group tag shows for a group the person is not in, even with one group', () => {
  renderWithApp(<><GroupTag community={{ id: 1, title: 'FC Altynka' }} /><GroupTag community={{ id: 7, title: 'Старая команда' }} /></>, { me: player });
  expect(screen.queryByText('FC Altynka')).toBeNull();
  expect(screen.getByText('Старая команда')).toBeVisible();
});

test('own history row of a left group has no link', () => {
  renderWithApp(<RatingHistory history={[
    { eventId: 1, community: { id: 1, title: 'FC Altynka' }, date: '2026-11-04', place: null, score: 7 },
    { eventId: 2, community: { id: 7, title: 'Старая команда' }, date: '2026-11-03', place: null, score: 6 },
  ]} />, { me: player });
  const links = screen.getAllByRole('link');
  expect(links.map(l => l.getAttribute('href'))).toEqual(['/event/1']);
  expect(screen.getByText('Старая команда')).toBeVisible();
});
