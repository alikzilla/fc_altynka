import type { MeDto } from '@altynka/core';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { openTelegramLink } from '../src/lib/tg';
import { NewEvent } from '../src/screens/NewEvent';
import { renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

const base: MeDto = { userId: 1, displayName: 'Орг', kaspiPhone: null, communities: [] };
const meWith = (communities: MeDto['communities']): MeDto => ({ ...base, communities });
const connectLink = 'https://t.me/fc_altynka_bot?startgroup=connect&admin=pin_messages';

beforeEach(() => { (api.send as Mock).mockResolvedValue({ id: 5 }); });

test('a single creatable group has no group field and sends its id', async () => {
  renderWithApp(<NewEvent onClose={() => {}} />, { me: meWith([{ id: 4, title: 'Футбол', role: 'organizer' }, { id: 5, title: 'Чужая', role: 'player' }]) });
  expect(screen.queryByRole('combobox', { name: 'Группа' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Создать матч' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events', expect.objectContaining({ communityId: 4 }));
  expect((api.send as Mock).mock.calls[0][2]).toEqual({ date: expect.any(String), communityId: 4, comment: undefined });
});

test('with several groups none is preselected and submit waits for a choice', async () => {
  renderWithApp(<NewEvent onClose={() => {}} />, { me: meWith([{ id: 4, title: 'Футбол', role: 'organizer' }, { id: 7, title: 'Суббота', role: 'admin' }]) });
  const group = screen.getByRole('combobox', { name: 'Группа' }) as HTMLSelectElement;
  expect(group.value).toBe('');
  expect(within(group).getAllByRole('option').map(o => o.textContent)).toEqual(['Выбери группу', 'Футбол', 'Суббота']);
  const submit = screen.getByRole('button', { name: 'Открыть запись' });
  expect(submit).toBeDisabled();
  await userEvent.selectOptions(group, 'Суббота');
  expect(submit).toBeEnabled();
  await userEvent.click(submit);
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events', expect.objectContaining({ communityId: 7 }));
});

test('without any group the sheet explains how to connect one', async () => {
  renderWithApp(<NewEvent onClose={() => {}} />, { me: meWith([]) });
  expect(screen.getByText(/Добавь бота в Telegram-группу/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Открыть запись' })).toBeNull();
  expect(screen.queryByLabelText('Дата')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Добавить в группу' }));
  expect(openTelegramLink).toHaveBeenCalledWith(connectLink);
});

test('a player everywhere is told to ask an admin and can still connect a group', async () => {
  renderWithApp(<NewEvent onClose={() => {}} />, { me: meWith([{ id: 4, title: 'Футбол', role: 'player' }]) });
  expect(screen.getByText('Создавать матчи может организатор группы. Попроси администратора группы назначить тебя организатором.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Дата')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Добавить в группу' }));
  expect(openTelegramLink).toHaveBeenCalledWith(connectLink);
});

describe('the summary line under the date strip keeps its place', () => {
  const dayOf = (iso: string) => ({ date: iso, unknown: 2, yes: [{ userId: 5, name: 'Тимур', parts: ['evening'] as const }], no: [] });
  const twoGroups = meWith([{ id: 4, title: 'Футбол', role: 'organizer' }, { id: 7, title: 'Суббота', role: 'admin' }]);

  test('several groups, none picked: a hint over the invisible summary row', async () => {
    renderWithApp(<NewEvent onClose={() => {}} />, { me: twoGroups });
    const hint = screen.getByText('Выбери группу — кто может играть');
    expect(hint.closest('.sheet-placeholder')?.querySelector('.sheet-placeholder-ghost summary')).not.toBeNull();
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/api/availability/summary'), expect.anything());
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Группа' }), 'Суббота');
    expect(screen.queryByText('Выбери группу — кто может играть')).toBeNull();
  });

  test('a known group: the place is reserved blank while the summary loads, then both variants share one cell', async () => {
    let resolve: (value: unknown) => void = () => {};
    (api.get as Mock).mockReturnValue(new Promise(r => { resolve = r; }));
    renderWithApp(<NewEvent onClose={() => {}} />, { me: meWith([{ id: 4, title: 'Футбол', role: 'organizer' }]) });
    const region = screen.getByRole('region', { name: 'Дата матча' });
    const line = region.querySelector('.summary-line')!;
    expect(line.classList.contains('sheet-stack')).toBe(true);
    expect(line.getAttribute('aria-hidden')).toBe('true');
    expect(region.querySelector('.sheet-placeholder')).toBeNull();
    await act(async () => { resolve({ community: { id: 4, title: 'Футбол' }, days: [dayOf('2000-01-01')] }); });
    await waitFor(() => expect(line.getAttribute('aria-hidden')).toBeNull());
    // The chosen day has no marks: the sentence is live, the summary row is in the same cell, invisible and inert.
    expect(line.querySelector(':scope > details')).toHaveAttribute('inert');
    expect(line.querySelector(':scope > details')).toHaveClass('sheet-stack-hidden');
    expect(within(line as HTMLElement).getByText(/На этот день отметок ещё нет/)).not.toHaveAttribute('inert');
  });
});
