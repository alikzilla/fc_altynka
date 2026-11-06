import type { MeDto } from '@altynka/core';
import { screen, within } from '@testing-library/react';
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
  expect(screen.queryByRole('radiogroup')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Создать матч' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events', expect.objectContaining({ communityId: 4 }));
  expect((api.send as Mock).mock.calls[0][2]).toEqual({ date: expect.any(String), communityId: 4, comment: undefined });
});

test('with several groups none is preselected and submit waits for a choice', async () => {
  renderWithApp(<NewEvent onClose={() => {}} />, { me: meWith([{ id: 4, title: 'Футбол', role: 'organizer' }, { id: 7, title: 'Суббота', role: 'admin' }]) });
  const group = screen.getByRole('radiogroup', { name: 'Группа' });
  const radios = within(group).getAllByRole('radio');
  expect(radios.map(r => (r as HTMLInputElement).checked)).toEqual([false, false]);
  expect(within(group).getByRole('radio', { name: 'Футбол' })).toBeInTheDocument();
  const submit = screen.getByRole('button', { name: 'Открыть запись' });
  expect(submit).toBeDisabled();
  await userEvent.click(within(group).getByRole('radio', { name: 'Суббота' }));
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
