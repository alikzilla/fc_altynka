import type { BillDto, EventDetailDto, SignupDto } from '@altynka/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api, ApiError } from '../src/api';
import { Bill } from '../src/screens/Bill';
import { copy, openLink } from '../src/tg';
import { organizer, player, renderWithApp } from './render';

vi.mock('../src/api', async orig => ({ ...(await orig<typeof import('../src/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/tg');

const s = (id: number): SignupDto => ({ id, seq: id, name: `Игрок${id}`, userId: id === 1 ? organizer.userId : id + 100, guestOfName: null, invitedByUserId: null, manual: false });
const evWith = (n: number, bill: BillDto | null = null): EventDetailDto => ({
  id: 5, date: '2026-11-07', status: bill ? 'billing' : 'scheduled', startTime: '21:00', durationHours: 2, place: null, comment: null,
  limit: 15, mainCount: n, reserveCount: 0, my: 'main', main: Array.from({ length: n }, (_, i) => s(i + 1)), reserve: [], teams: null, bill,
});
const bill: BillDto = {
  id: 3, receiver: { userId: organizer.userId, name: 'Орг', kaspiPhone: '+77071234567' }, fieldAmount: 20000, extras: [],
  total: 20000, share: 2000, status: 'open', participantSignupIds: [1, 2],
  lines: [
    { id: 30, userId: organizer.userId, name: 'Орг', units: 1, amount: 2000, paidAmount: 2000, state: 'paid', due: 0 },
    { id: 31, userId: player.userId, name: 'Игрок', units: 1, amount: 2000, paidAmount: null, state: 'unpaid', due: 2000 },
  ],
};

test('live share preview rounds up to 50', async () => {
  renderWithApp(<Bill ev={evWith(12)} reload={() => {}} />, { me: organizer });
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '20000');
  expect(screen.getByText(/По 1 700 ₸/)).toBeInTheDocument();
});

test('unchecking a participant updates preview', async () => {
  renderWithApp(<Bill ev={evWith(10)} reload={() => {}} />, { me: organizer });
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '20000');
  expect(screen.getByText(/По 2 000 ₸/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Игрок10' }));
  expect(screen.getByText(/По 2 250 ₸/)).toBeInTheDocument();
});

test('extras are added to the total', async () => {
  renderWithApp(<Bill ev={evWith(10)} reload={() => {}} />, { me: organizer });
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '20000');
  await userEvent.click(screen.getByRole('button', { name: '+ Расход' }));
  await userEvent.type(screen.getByLabelText('Расход 1'), 'Вода');
  await userEvent.type(screen.getByLabelText('Сумма расхода 1'), '1500');
  expect(screen.getByText(/По 2 150 ₸/)).toBeInTheDocument();
  (api.send as Mock).mockResolvedValue(bill);
  await userEvent.click(screen.getByRole('button', { name: 'Выставить счёт' }));
  expect((api.send as Mock).mock.calls[0]).toEqual(['PUT', '/api/events/5/bill', expect.objectContaining({
    receiverUserId: organizer.userId, fieldAmount: 20000, extras: [{ label: 'Вода', amount: 1500 }],
  })]);
});

test('bad phone error shows next to the field', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(400, 'bad_phone'));
  renderWithApp(<Bill ev={evWith(10)} reload={() => {}} />, { me: organizer });
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '20000');
  await userEvent.click(screen.getByRole('button', { name: 'Выставить счёт' }));
  expect(await screen.findByText('Проверь номер')).toBeInTheDocument();
});

test('player: transfer copies phone and opens Kaspi; "Я скинул" posts paid', async () => {
  (copy as Mock).mockResolvedValue(true);
  (api.send as Mock).mockResolvedValue({ kind: 'ok' });
  renderWithApp(<Bill ev={evWith(2, bill)} reload={() => {}} />, { me: player });
  expect(screen.getByText(/С тебя 2 000 ₸/)).toBeInTheDocument();
  expect(screen.getAllByText(/\+7 707 123 45 67/).length).toBeGreaterThan(0);
  await userEvent.click(screen.getByRole('button', { name: 'Перевести' }));
  expect(copy).toHaveBeenCalledWith('+77071234567');
  expect(openLink).toHaveBeenCalledWith('https://kaspi.kz/');
  await userEvent.click(screen.getByRole('button', { name: 'Я скинул' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/bills/3/paid');
});

test('underpaid shows due amount', () => {
  const b = { ...bill, lines: [bill.lines[0], { ...bill.lines[1], amount: 2500, paidAmount: 2000, state: 'underpaid' as const, due: 500 }] };
  renderWithApp(<Bill ev={evWith(2, b)} reload={() => {}} />, { me: player });
  expect(screen.getByText(/Доплатить 500 ₸/)).toBeInTheDocument();
});

test('player without a bill sees a placeholder', () => {
  renderWithApp(<Bill ev={evWith(2)} reload={() => {}} />, { me: player });
  expect(screen.getByText('Счёт ещё не выставлен')).toBeInTheDocument();
});

test('receiver toggles a line and reminds debtors', async () => {
  (api.send as Mock).mockResolvedValue({ kind: 'ok' });
  renderWithApp(<Bill ev={evWith(2, bill)} reload={() => {}} />, { me: organizer });
  await userEvent.click(screen.getByRole('checkbox', { name: 'Игрок скинул' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/bill-lines/31', { paid: true });
  const remind = screen.getByRole('button', { name: 'Напомнить должникам' });
  await userEvent.click(remind);
  await userEvent.click(remind);
  expect(api.send).toHaveBeenCalledWith('POST', '/api/bills/3/remind');
});

test('editing a bill keeps the people who were left out unchecked', async () => {
  renderWithApp(<Bill ev={evWith(3, bill)} reload={() => {}} />, { me: organizer });
  await userEvent.click(screen.getByRole('button', { name: 'Изменить' }));
  expect(screen.getByRole('checkbox', { name: 'Игрок2' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Игрок3' })).not.toBeChecked();
});
