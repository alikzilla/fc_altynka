import type { BillDto, EventDetailDto } from '@altynka/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { ReminderDelivery } from '../src/screens/ReminderDelivery';
import { Bill } from '../src/screens/Bill';
import { organizer, player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

const queued = { at: 1, sent: 0, unavailable: 0, skipped: 0, failed: 0, status: 'queued' as const };
beforeEach(() => { (api.get as Mock).mockResolvedValue({ report: null }); });
afterEach(() => { vi.useRealTimers(); });
const settle = async () => { await act(async () => {}); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

test('an unused reminder shows private delivery, group fallback and the 24-hour limit', async () => {
  render(<ReminderDelivery billId={3} />);
  await settle();
  expect(api.get).toHaveBeenCalledWith('/api/bills/3/reminder-status');
  expect(screen.getByText(/личный чат/)).toBeInTheDocument();
  expect(screen.getByText(/групп/)).toBeInTheDocument();
  expect(screen.getByText(/24 часа/)).toBeInTheDocument();
});

test('a queued reminder polls and only reports private sends after the server confirms them', async () => {
  vi.useFakeTimers();
  (api.get as Mock).mockResolvedValueOnce({ report: queued }).mockResolvedValue({ report: { ...queued, sent: 2, unavailable: 1, skipped: 3, status: 'complete' } });
  render(<ReminderDelivery billId={3} />);
  await settle();
  expect(screen.getByText(/в очереди/)).toBeInTheDocument();
  expect(screen.queryByText(/личный чат: 2/)).not.toBeInTheDocument();
  await advance(2000);
  expect(screen.getByText(/личный чат: 2/)).toBeInTheDocument();
  expect(screen.getByText(/ЛС недоступны: 1/)).toBeInTheDocument();
  expect(screen.getByText(/24 часа: 3/)).toBeInTheDocument();
  const count = (api.get as Mock).mock.calls.length;
  await advance(6000);
  expect(api.get).toHaveBeenCalledTimes(count);
});

test('retrying reports stop polling after 30 seconds and offer a manual refresh', async () => {
  vi.useFakeTimers();
  (api.get as Mock).mockResolvedValue({ report: { ...queued, failed: 1, status: 'retrying' } });
  render(<ReminderDelivery billId={3} />);
  await settle();
  expect(screen.getByText(/повтор/)).toBeInTheDocument();
  await advance(30_000);
  expect(screen.getByRole('button', { name: 'Обновить доставку' })).toBeInTheDocument();
  const count = (api.get as Mock).mock.calls.length;
  await advance(6000);
  expect(api.get).toHaveBeenCalledTimes(count);
  fireEvent.click(screen.getByRole('button', { name: 'Обновить доставку' }));
  await settle();
  expect(api.get).toHaveBeenCalledTimes(count + 1);
  await advance(2000);
  expect(api.get).toHaveBeenCalledTimes(count + 2);
});

test('unmount clears polling and mutation refresh listeners', async () => {
  vi.useFakeTimers();
  (api.get as Mock).mockResolvedValue({ report: queued });
  const view = render(<ReminderDelivery billId={3} />);
  await settle();
  view.unmount();
  const count = (api.get as Mock).mock.calls.length;
  await advance(6000);
  window.dispatchEvent(new Event('altynka:mutation'));
  await settle();
  expect(api.get).toHaveBeenCalledTimes(count);
});

test('a mutation refreshes delivery and a failed request offers recovery', async () => {
  (api.get as Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ report: null });
  render(<ReminderDelivery billId={3} />);
  await settle();
  expect(screen.getByText(/Не удалось обновить/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Обновить доставку' }));
  await settle();
  (api.get as Mock).mockResolvedValue({ report: queued });
  act(() => window.dispatchEvent(new Event('altynka:mutation')));
  await settle();
  expect(screen.getByText(/в очереди/)).toBeInTheDocument();
});

const bill: BillDto = {
  id: 3, receiver: { userId: organizer.userId, name: 'Орг', kaspiPhone: '+77071234567' }, fieldAmount: 4000, extras: [], total: 4000, share: 2000,
  status: 'open', participantSignupIds: [], lines: [{ id: 31, userId: player.userId, name: 'Игрок', units: 1, amount: 2000, paidAmount: null, state: 'unpaid', due: 2000 }],
};
const event: EventDetailDto = { id: 5, date: '2026-11-07', status: 'billing', startTime: '21:00', durationHours: 2, place: null, comment: null, limit: 15, mainCount: 0, reserveCount: 0, my: null, main: [], reserve: [], teams: null, bill };

test('the organizer queues private reminders without claiming they were already sent', async () => {
  (api.send as Mock).mockResolvedValue({ kind: 'ok' });
  renderWithApp(<Bill ev={event} reload={() => {}} />, { me: organizer });
  await userEvent.click(screen.getByRole('button', { name: 'Напомнить должникам' }));
  expect(screen.getByText('Отправить личные напоминания?')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Отправить личные напоминания?' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/bills/3/remind');
  expect(await screen.findByText('Напоминания поставлены в очередь')).toBeInTheDocument();
  expect(screen.queryByText('Напоминание отправлено')).not.toBeInTheDocument();
});

test('payment marking confirms only the player action and hides organizer reminder status', async () => {
  (api.send as Mock).mockResolvedValue({ kind: 'ok' });
  renderWithApp(<Bill ev={event} reload={() => {}} />, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Я скинул' }));
  expect(await screen.findByText('Ты отметил оплату')).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
});
