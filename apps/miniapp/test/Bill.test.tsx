import type { BillDto, EventDetailDto, SignupDto } from '@altynka/core';
import { act, screen, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api, ApiError } from '../src/lib/api';
import { Bill } from '../src/screens/Bill';
import { copy, openLink } from '../src/lib/tg';
import { organizer, player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn().mockResolvedValue({ report: null }), send: vi.fn() } }));
vi.mock('../src/lib/tg');

const s = (id: number): SignupDto => ({ id, seq: id, name: `Игрок${id}`, userId: id === 1 ? organizer.userId : id + 100, guestOfName: null, invitedByUserId: null });
const evWith = (n: number, bill: BillDto | null = null): EventDetailDto => ({
  id: 5, community: { id: 1, title: 'FC Altynka' }, viewerRole: 'organizer', date: '2026-11-07', status: bill ? 'billing' : 'playing', startTime: '21:00', durationHours: 2, place: null, comment: null,
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

function billAction() {
  const dialog = screen.queryByRole('dialog', { name: 'Выставить счёт' });
  return (dialog ? within(dialog) : screen).getByRole('button', { name: 'Выставить счёт' });
}

test('future scheduled game cannot open a bill even after time is assigned', () => {
  renderWithApp(<Bill ev={{ ...evWith(2), status: 'scheduled', serverNow: Date.parse('2026-11-07T15:59:59Z') }} reload={() => {}} />, { me: organizer });
  expect(screen.queryByRole('button', { name: 'Выставить счёт' })).not.toBeInTheDocument();
  expect(screen.getByText('Счёт будет доступен после начала матча')).toBeVisible();
});

test('organizer opens the bill in a sheet while retaining the payment screen', async () => {
  renderWithApp(<Bill ev={evWith(10)} reload={() => {}} />, { me: organizer });
  expect(screen.queryByLabelText('Аренда поля, ₸')).not.toBeInTheDocument();
  const create = billAction();
  expect(create.closest('.match-action')).not.toBeNull();
  await userEvent.click(create);
  const dialog = screen.getByRole('dialog', { name: 'Выставить счёт' });
  expect(within(dialog).getByLabelText('Аренда поля, ₸')).toBeVisible();
  expect(screen.getByText('Счёт пока не выставлен')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Выставить счёт' }).closest('.sheet-footer')).not.toBeNull();
});

test('bill sheet locks dismissal during submission and keeps fields after an error', async () => {
  let reject!: (error: Error) => void;
  (api.send as Mock).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  renderWithApp(<Bill ev={evWith(2)} reload={() => {}} />, { me: organizer });
  await userEvent.click(billAction());
  const dialog = screen.getByRole('dialog', { name: 'Выставить счёт' });
  await userEvent.type(within(dialog).getByLabelText('Аренда поля, ₸'), '4000');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Выставить счёт' }));
  expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Отправляем счёт…' })).toBeDisabled();
  reject(new Error('offline'));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Не получилось выставить счёт');
  expect(within(dialog).getByLabelText('Аренда поля, ₸')).toHaveValue(4000);
  expect(within(dialog).getByRole('button', { name: 'Закрыть' })).toBeEnabled();
});

test('creation sheet retains its draft when refresh first discovers a bill', async () => {
  let refresh!: (value: EventDetailDto) => void;
  function RefreshableBill() {
    const [event, setEvent] = useState(evWith(2));
    refresh = setEvent;
    return <Bill ev={event} reload={() => {}} />;
  }
  renderWithApp(<RefreshableBill />, { me: organizer });
  await userEvent.click(billAction());
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '4000');
  act(() => refresh(evWith(2, bill)));
  expect(screen.getByLabelText('Аренда поля, ₸')).toHaveValue(4000);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

test('refresh discovering the pending bill keeps the sheet locked until its original request completes', async () => {
  let refresh!: (value: EventDetailDto) => void;
  let finish!: () => void;
  const reload = vi.fn();
  (api.send as Mock).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  function RefreshableBill() {
    const [event, setEvent] = useState(evWith(2));
    refresh = setEvent;
    return <Bill ev={event} reload={reload} />;
  }
  renderWithApp(<RefreshableBill />, { me: organizer });
  await userEvent.click(billAction());
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '4000');
  await userEvent.click(billAction());
  act(() => refresh(evWith(2, bill)));
  expect(screen.getByRole('button', { name: 'Закрыть' })).toBeDisabled();
  expect(screen.getByLabelText('Аренда поля, ₸')).toHaveValue(4000);
  await act(async () => finish());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(reload).toHaveBeenCalledOnce();
});

test('personal payment precedes expenses and keeps the amount in the same card when paid', () => {
  renderWithApp(<Bill ev={evWith(2, bill)} reload={() => {}} />, { me: player });
  const card = screen.getByRole('region', { name: 'Твоя оплата' });
  expect(within(card).getByText('К оплате')).toBeVisible();
  expect(within(card).getByRole('button', { name: 'Перевести в Kaspi' }).closest('.match-action')).toBeNull();
  expect(card.compareDocumentPosition(screen.getByRole('heading', { name: 'Общие расходы' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('marked payment keeps a permanent status label and amount', () => {
  const marked = { ...bill, lines: [bill.lines[0], { ...bill.lines[1], state: 'paid' as const, paidAmount: 2000, due: 0 }] };
  renderWithApp(<Bill ev={evWith(2, marked)} reload={() => {}} />, { me: player });
  const card = screen.getByRole('region', { name: 'Твоя оплата' });
  expect(within(card).getByText('Ты отметил оплату')).toBeVisible();
  expect(within(card).getByRole('button', { name: /Скопировать сумму/ })).toHaveTextContent('2 000 ₸');
  expect(within(card).queryByRole('button', { name: 'Перевести в Kaspi' })).not.toBeInTheDocument();
});

test('closed bill with outstanding due is read-only', () => {
  const closed = { ...bill, status: 'closed' as const };
  renderWithApp(<Bill ev={evWith(2, closed)} reload={() => {}} />, { me: player });
  expect(screen.queryByRole('button', { name: 'Перевести в Kaspi' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Я перевёл' })).not.toBeInTheDocument();
  expect(screen.getByText('Расчёт закрыт')).toBeVisible();
});

test('live share preview rounds up to 50', async () => {
  renderWithApp(<Bill ev={evWith(12)} reload={() => {}} />, { me: organizer });
  await userEvent.click(billAction());
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '20000');
  expect(screen.getByText(/По 1 700 ₸/)).toBeInTheDocument();
});

test('unchecking a participant updates preview', async () => {
  renderWithApp(<Bill ev={evWith(10)} reload={() => {}} />, { me: organizer });
  await userEvent.click(billAction());
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '20000');
  expect(screen.getByText(/По 2 000 ₸/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Игрок10' }));
  expect(screen.getByText(/По 2 250 ₸/)).toBeInTheDocument();
});

test('extras are added to the total', async () => {
  renderWithApp(<Bill ev={evWith(10)} reload={() => {}} />, { me: organizer });
  await userEvent.click(billAction());
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '20000');
  await userEvent.click(screen.getByRole('button', { name: '+ Расход' }));
  await userEvent.type(screen.getByLabelText('Расход 1'), 'Вода');
  await userEvent.type(screen.getByLabelText('Сумма расхода 1'), '1500');
  expect(screen.getByText(/По 2 150 ₸/)).toBeInTheDocument();
  (api.send as Mock).mockResolvedValue(bill);
  await userEvent.click(billAction());
  expect((api.send as Mock).mock.calls[0]).toEqual(['PUT', '/api/events/5/bill', expect.objectContaining({
    receiverUserId: organizer.userId, fieldAmount: 20000, extras: [{ label: 'Вода', amount: 1500 }],
  })]);
});

test('bad phone error shows next to the field', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(400, 'bad_phone'));
  renderWithApp(<Bill ev={evWith(10)} reload={() => {}} />, { me: organizer });
  await userEvent.click(billAction());
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '20000');
  await userEvent.click(billAction());
  expect(await screen.findByText('Проверь номер')).toBeInTheDocument();
});

test('player: transfer copies phone and opens Kaspi; "Я перевёл" posts paid', async () => {
  (copy as Mock).mockResolvedValue(true);
  (api.send as Mock).mockResolvedValue({ kind: 'ok' });
  renderWithApp(<Bill ev={evWith(2, bill)} reload={() => {}} />, { me: player });
  expect(screen.getByText('К оплате')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Скопировать сумму/ })).toHaveTextContent('2 000 ₸');
  await userEvent.click(screen.getByRole('button', { name: 'Перевести в Kaspi' }));
  expect(copy).toHaveBeenCalledWith('+77071234567');
  expect(openLink).toHaveBeenCalledWith('https://kaspi.kz/');
  await userEvent.click(screen.getByRole('button', { name: 'Я перевёл' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/bills/3/paid');
});

test('underpaid shows due amount', () => {
  const b = { ...bill, lines: [bill.lines[0], { ...bill.lines[1], amount: 2500, paidAmount: 2000, state: 'underpaid' as const, due: 500 }] };
  renderWithApp(<Bill ev={evWith(2, b)} reload={() => {}} />, { me: player });
  expect(screen.getByText('Доплатить')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Скопировать сумму/ })).toHaveTextContent('500 ₸');
});

test('player without a bill sees a placeholder', () => {
  renderWithApp(<Bill ev={{ ...evWith(2), viewerRole: 'player' }} reload={() => {}} />, { me: player });
  expect(screen.getByText('Счёт ещё не выставлен')).toBeInTheDocument();
});

test('receiver toggles a line and reminds debtors', async () => {
  (api.send as Mock).mockResolvedValue({ kind: 'ok' });
  renderWithApp(<Bill ev={evWith(2, bill)} reload={() => {}} />, { me: organizer });
  expect(screen.getByText('Кто-то перевёл, но не отметил? Поставь галочку сам.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Игрок перевёл' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/bill-lines/31', { paid: true });
  const remind = screen.getByRole('button', { name: 'Напомнить должникам' });
  await userEvent.click(remind);
  await userEvent.click(remind);
  expect(api.send).toHaveBeenCalledWith('POST', '/api/bills/3/remind');
});

test('closed bill keeps the checkboxes: unticking a mistaken mark reopens it', async () => {
  (api.send as Mock).mockResolvedValue({ kind: 'ok' });
  const closed: BillDto = { ...bill, status: 'closed', lines: bill.lines.map(l => ({ ...l, paidAmount: l.amount, state: 'paid', due: 0 })) };
  renderWithApp(<Bill ev={{ ...evWith(2, closed), status: 'closed' }} reload={() => {}} />, { me: organizer });
  expect(screen.getByText('Отметил по ошибке? Сними галочку — счёт откроется снова.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Напомнить должникам' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Игрок перевёл' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/bill-lines/31', { paid: false });
});

test('editing a bill keeps the people who were left out unchecked', async () => {
  renderWithApp(<Bill ev={evWith(3, bill)} reload={() => {}} />, { me: organizer });
  await userEvent.click(screen.getByRole('button', { name: 'Изменить' }));
  expect(screen.getByRole('checkbox', { name: 'Игрок2' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Игрок3' })).not.toBeChecked();
});

test('another receiver with a saved phone: number is read-only and not sent', async () => {
  const ev = evWith(2);
  ev.main[1] = { ...ev.main[1], kaspiPhone: '+77011111111' };
  (api.send as Mock).mockResolvedValue(bill);
  renderWithApp(<Bill ev={ev} reload={() => {}} />, { me: organizer });
  await userEvent.click(billAction());
  await userEvent.selectOptions(screen.getByLabelText('Кто заплатил за поле'), String(ev.main[1].userId));
  const field = screen.getByLabelText(/Номер Kaspi получателя/);
  expect(field).toHaveAttribute('readonly');
  expect(field).toHaveValue('+7 701 111 11 11');
  expect(screen.getByText('Номер получатель меняет в своём профиле')).toBeVisible();
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '4000');
  await userEvent.click(billAction());
  expect((api.send as Mock).mock.calls.at(-1)![2]).toMatchObject({ receiverUserId: ev.main[1].userId, receiverKaspiPhone: undefined });
});

test('only the organizer and players with a saved Kaspi number can be picked as the receiver', async () => {
  const ev = evWith(3);
  ev.main[1] = { ...ev.main[1], kaspiPhone: '+77011111111' };
  renderWithApp(<Bill ev={ev} reload={() => {}} />, { me: organizer });
  await userEvent.click(billAction());
  const options = within(screen.getByLabelText('Кто заплатил за поле')).getAllByRole('option').map(o => o.textContent);
  expect(options).toEqual(['Игрок1', 'Игрок2']);
  expect(screen.getByText('Другого получателя можно выбрать, если он сохранил номер Kaspi в своём профиле')).toBeVisible();
});

test('a receiver who removed their number while the sheet was open is explained', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(409, 'receiver_no_phone'));
  const ev = evWith(2);
  ev.main[1] = { ...ev.main[1], kaspiPhone: '+77011111111' };
  renderWithApp(<Bill ev={ev} reload={() => {}} />, { me: organizer });
  await userEvent.click(billAction());
  await userEvent.selectOptions(screen.getByLabelText('Кто заплатил за поле'), String(ev.main[1].userId));
  await userEvent.type(screen.getByLabelText('Аренда поля, ₸'), '4000');
  await userEvent.click(billAction());
  expect(await screen.findByText('У получателя нет номера Kaspi в профиле. Выбери другого или себя.')).toBeInTheDocument();
});

test('after returning from Kaspi the mark becomes a visible button and can be undone from the notification', async () => {
  (copy as Mock).mockResolvedValue(true);
  (api.send as Mock).mockResolvedValue({ kind: 'ok' });
  renderWithApp(<Bill ev={evWith(2, bill)} reload={() => {}} />, { me: player });
  expect(screen.getByText(/Отметку увидит получатель/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Перевести в Kaspi' }));
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await userEvent.click(screen.getByRole('button', { name: 'Перевёл? Отметь оплату' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/bills/3/paid');
  await userEvent.click(await screen.findByRole('button', { name: 'Отменить' }));
  expect(api.send).toHaveBeenLastCalledWith('DELETE', '/api/bills/3/paid');
  expect(await screen.findByText('Отметка об оплате снята')).toBeInTheDocument();
});

test('a failed payment mark stays next to the button instead of vanishing', async () => {
  (api.send as Mock).mockRejectedValue(new Error('offline'));
  renderWithApp(<Bill ev={evWith(2, bill)} reload={() => {}} />, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Я перевёл' }));
  expect(await within(screen.getByRole('region', { name: 'Твоя оплата' })).findByRole('alert')).toHaveTextContent('Не получилось отметить оплату');
});

test('organizer mark shows at once and is taken back with a notice when the server refuses', async () => {
  let reject!: (error: Error) => void;
  (api.send as Mock).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  renderWithApp(<Bill ev={evWith(2, bill)} reload={() => {}} />, { me: organizer });
  const box = screen.getByRole('checkbox', { name: 'Игрок перевёл' });
  await userEvent.click(box);
  expect(box).toBeChecked();
  expect(screen.getByText('Оплату отметили 2 из 2')).toBeInTheDocument();
  await act(async () => reject(new Error('offline')));
  expect(box).not.toBeChecked();
  expect(screen.getByText('Оплату отметили 1 из 2')).toBeInTheDocument();
  expect(await screen.findByText('Не получилось отметить оплату: Игрок. Попробуй ещё раз.')).toBeInTheDocument();
});

test('an accepted mark stays until the refreshed bill arrives', async () => {
  (api.send as Mock).mockResolvedValue({ kind: 'ok' });
  let refresh!: (value: EventDetailDto) => void;
  function RefreshableBill() {
    const [event, setEvent] = useState(evWith(2, bill));
    refresh = setEvent;
    return <Bill ev={event} reload={() => {}} />;
  }
  renderWithApp(<RefreshableBill />, { me: organizer });
  const box = screen.getByRole('checkbox', { name: 'Игрок перевёл' });
  await userEvent.click(box);
  await act(async () => {});
  expect(box).toBeChecked();
  // Someone else took the mark off meanwhile: the fresh bill from the server is the truth.
  act(() => refresh(evWith(2, { ...bill, lines: [...bill.lines] })));
  expect(box).not.toBeChecked();
});

test('marks on one line reach the server in the order they were tapped', async () => {
  let resolve!: (value: unknown) => void;
  (api.send as Mock).mockImplementationOnce(() => new Promise(ok => { resolve = ok; })).mockResolvedValue({ kind: 'ok' });
  renderWithApp(<Bill ev={evWith(2, bill)} reload={() => {}} />, { me: organizer });
  const box = screen.getByRole('checkbox', { name: 'Игрок перевёл' });
  await userEvent.click(box);
  await userEvent.click(box);
  expect(box).not.toBeChecked();
  expect(api.send).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ kind: 'ok' }));
  expect(api.send).toHaveBeenCalledTimes(2);
  expect(api.send).toHaveBeenLastCalledWith('POST', '/api/bill-lines/31', { paid: false });
});

test('player mark switches the card at once and returns the button when the server refuses', async () => {
  let reject!: (error: Error) => void;
  (api.send as Mock).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  renderWithApp(<Bill ev={evWith(2, bill)} reload={() => {}} />, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Я перевёл' }));
  const card = screen.getByRole('region', { name: 'Твоя оплата' });
  expect(within(card).getByText('Ты отметил оплату')).toBeInTheDocument();
  expect(within(card).queryByRole('button', { name: 'Я перевёл' })).not.toBeInTheDocument();
  await act(async () => reject(new Error('offline')));
  expect(within(card).getByText('К оплате')).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Я перевёл' })).toBeEnabled();
  expect(within(card).getByRole('alert')).toHaveTextContent('Не получилось отметить оплату');
});

test('the share and the first extra keep outlines until they appear, then fade in there', async () => {
  const shareHint = 'Укажи аренду — здесь появится сумма с человека';
  const extraHint = 'Нажми «+ Расход» — новая строка';
  renderWithApp(<Bill ev={evWith(10)} reload={() => {}} />, { me: organizer });
  await userEvent.click(billAction());
  const dialog = screen.getByRole('dialog', { name: 'Выставить счёт' });
  expect(within(dialog).getByText(shareHint)).toBeVisible();
  expect(within(dialog).getByText(extraHint)).toBeVisible();
  await userEvent.type(within(dialog).getByLabelText('Аренда поля, ₸'), '20000');
  expect(within(dialog).queryByText(shareHint)).toBeNull();
  expect(within(dialog).getByText(/По 2 000 ₸/).closest('.preview')).toHaveClass('reveal');
  await userEvent.click(within(dialog).getByRole('button', { name: '+ Расход' }));
  expect(within(dialog).queryByText(extraHint)).toBeNull();
  expect(within(dialog).getByLabelText('Расход 1').closest('.extra')).toHaveClass('reveal');
  // An empty extra hides the share, but the rent is there: its outline stays, without the rent hint.
  expect(dialog.querySelector('.preview-placeholder')).not.toBeNull();
  expect([...dialog.querySelectorAll('.preview')].every(p => p.closest('.sheet-placeholder-ghost'))).toBe(true);
  expect(within(dialog).queryByText(shareHint)).toBeNull();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Убрать расход 1' }));
  expect(within(dialog).getByText(extraHint)).toBeVisible();
});

test('the Kaspi number keeps a line for its error and one cell for both field variants', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(400, 'no_kaspi'));
  const ev = evWith(2);
  ev.main[1] = { ...ev.main[1], kaspiPhone: '+77011111111' };
  renderWithApp(<Bill ev={ev} reload={() => {}} />, { me: organizer });
  await userEvent.click(billAction());
  const dialog = screen.getByRole('dialog', { name: 'Выставить счёт' });
  const typed = within(dialog).getByLabelText(/Номер Kaspi получателя/);
  expect(typed).not.toHaveAttribute('readonly');
  const label = typed.closest('.bill-phone-field')!;
  const slot = label.querySelector('.field-error-slot')!;
  expect(slot).not.toBeNull();
  expect(slot).toHaveTextContent('');
  const saved = label.querySelector('input[readonly]')!;
  expect(saved.closest('[inert]')).toHaveClass('sheet-stack-hidden');
  expect(typed.closest('.sheet-stack')).toBe(saved.closest('.sheet-stack'));
  await userEvent.type(within(dialog).getByLabelText('Аренда поля, ₸'), '4000');
  await userEvent.click(billAction());
  expect(await within(slot as HTMLElement).findByText('Нужен номер Kaspi получателя')).toBeInTheDocument();
  await userEvent.selectOptions(within(dialog).getByLabelText('Кто заплатил за поле'), String(ev.main[1].userId));
  expect(within(dialog).getByLabelText(/Номер Kaspi получателя/)).toHaveAttribute('readonly');
  expect(typed.closest('[inert]')).toHaveClass('sheet-stack-hidden');
  expect(saved.closest('[inert]')).toBeNull();
});
