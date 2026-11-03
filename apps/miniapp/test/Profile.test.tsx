import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api, ApiError } from '../src/api';
import { Profile } from '../src/screens/Profile';
import { organizer, player, renderWithApp } from './render';

vi.mock('../src/api', async orig => ({ ...(await orig<typeof import('../src/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/tg');

test('profile rejects junk phone before sending', async () => {
  renderWithApp(<Profile />, { me: player });
  await userEvent.type(screen.getByLabelText('Номер Kaspi'), 'abc');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(screen.getByText('Проверь номер')).toBeInTheDocument();
  expect(api.send).not.toHaveBeenCalled();
});

test('profile saves normalized phone and trimmed name', async () => {
  (api.send as Mock).mockResolvedValue({});
  renderWithApp(<Profile />, { me: player });
  const name = screen.getByLabelText('Имя в списках');
  await userEvent.clear(name);
  await userEvent.type(name, '  Дамир ');
  await userEvent.type(screen.getByLabelText('Номер Kaspi'), '8 707 123 45 67');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/me', { displayName: 'Дамир', kaspiPhone: '+77071234567' });
});

test('receiver of an open bill is told why the phone cannot be cleared', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(409, 'receiver_needs_phone'));
  renderWithApp(<Profile />, { me: organizer });
  await userEvent.clear(screen.getByLabelText('Номер Kaspi'));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(await screen.findByText('Тебе переводят по открытому счёту — номер нужен')).toBeInTheDocument();
});

test('a taken name is shown next to the name field', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(409, 'name_taken'));
  renderWithApp(<Profile />, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(await screen.findByText('Это имя уже занято — добавь букву фамилии или номер')).toBeInTheDocument();
});
