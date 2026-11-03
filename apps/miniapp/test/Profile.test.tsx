import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/api';
import { Profile } from '../src/screens/Profile';
import { player, renderWithApp } from './render';

vi.mock('../src/api');
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
