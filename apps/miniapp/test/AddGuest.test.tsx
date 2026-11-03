import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { Route } from 'wouter';
import { api, ApiError } from '../src/api';
import { AddGuest } from '../src/screens/AddGuest';
import { player, renderWithApp } from './render';

vi.mock('../src/api', async orig => ({ ...(await orig<typeof import('../src/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/tg');

const renderForm = () => renderWithApp(<Route path="/event/:id/guest" component={AddGuest} />, { me: player, path: '/event/5/guest' });

test('«Записать» is disabled while the guest is being added', async () => {
  (api.send as Mock).mockReturnValue(new Promise(() => {}));
  renderForm();
  await userEvent.type(screen.getByLabelText('Имя друга'), 'Ержан');
  await userEvent.click(screen.getByRole('button', { name: 'Записать' }));
  expect(screen.getByRole('button', { name: 'Записать' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Записать' }));
  expect(api.send).toHaveBeenCalledTimes(1);
});

test('a guest already on the list is reported by name', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(409, 'guest_exists'));
  renderForm();
  await userEvent.type(screen.getByLabelText('Имя друга'), 'Ержан');
  await userEvent.click(screen.getByRole('button', { name: 'Записать' }));
  expect(await screen.findByText('Ержан уже в списке')).toBeInTheDocument();
});
