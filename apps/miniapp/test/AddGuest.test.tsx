import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api, ApiError } from '../src/lib/api';
import { AddGuestSheet } from '../src/screens/AddGuest';
import { player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

const renderSheet = (props: Partial<Parameters<typeof AddGuestSheet>[0]> = {}) =>
  renderWithApp(<AddGuestSheet eventId={5} onClose={() => {}} onAdded={() => {}} {...props} />, { me: player, path: '/event/5' });

test('the friend is added from a bottom sheet, then the list reloads and the sheet closes', async () => {
  (api.send as Mock).mockResolvedValue({ kind: 'main', position: 4 });
  const onAdded = vi.fn();
  const onClose = vi.fn();
  renderSheet({ onAdded, onClose });
  expect(screen.getByRole('dialog', { name: 'Привести друга' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Имя друга'), ' Ержан ');
  await userEvent.click(screen.getByRole('button', { name: 'Записать' }));
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events/5/guests', { name: 'Ержан' });
  expect(await screen.findByText('Друг в основе, №4')).toBeInTheDocument();
  expect(onAdded).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalled();
});

test('«Записать» is disabled while the guest is being added', async () => {
  (api.send as Mock).mockReturnValue(new Promise(() => {}));
  renderSheet();
  await userEvent.type(screen.getByLabelText('Имя друга'), 'Ержан');
  await userEvent.click(screen.getByRole('button', { name: 'Записать' }));
  expect(screen.getByRole('button', { name: 'Записываем…' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Записываем…' }));
  expect(api.send).toHaveBeenCalledTimes(1);
});

test('a guest already on the list is reported by name', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(409, 'guest_exists'));
  renderSheet();
  await userEvent.type(screen.getByLabelText('Имя друга'), 'Ержан');
  await userEvent.click(screen.getByRole('button', { name: 'Записать' }));
  expect(await screen.findByText('Ержан уже в списке')).toBeInTheDocument();
});
