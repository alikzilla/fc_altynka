import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api, ApiError } from '../src/lib/api';
import { ProfileSettingsSheet } from '../src/screens/ProfileSettings';
import { Profile } from '../src/screens/Profile';
import { organizer, player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');
const close = vi.fn();
beforeEach(() => close.mockClear());

test('the profile opens a settings section as a bottom sheet over itself', async () => {
  (api.get as Mock).mockResolvedValue({ statistics: null, gameHistory: [], history: [] });
  renderWithApp(<Profile settings="name" />, { me: { ...player, profileCompleted: true } });
  expect(screen.getByRole('heading', { level: 1, name: 'Профиль' })).toBeInTheDocument();
  expect(await screen.findByRole('dialog', { name: 'Изменить имя' })).toBeInTheDocument();
});

test('an unknown section shows the profile without a sheet', () => {
  (api.get as Mock).mockResolvedValue({ statistics: null, gameHistory: [], history: [] });
  renderWithApp(<Profile settings="unknown" />, { me: { ...player, profileCompleted: true } });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('payment settings normalize just the payment number without changing setup or drafts in other sections', async () => {
  (api.send as Mock).mockResolvedValue({ ...player, kaspiPhone: '+77071234567', profileCompleted: true });
  renderWithApp(<ProfileSettingsSheet section="payment" onClose={close} />, { me: { ...player, profileCompleted: true } });
  await userEvent.type(screen.getByLabelText('Номер Kaspi'), '8 707 123 45 67');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/me', { kaspiPhone: '+77071234567' });
  expect(await screen.findByText('Сохранено')).toBeInTheDocument();
  expect(close).toHaveBeenCalled();
});

test('receiver restriction stays next to the payment field and preserves the draft', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(409, 'receiver_needs_phone'));
  renderWithApp(<ProfileSettingsSheet section="payment" onClose={close} />, { me: { ...organizer, profileCompleted: true } });
  await userEvent.clear(screen.getByLabelText('Номер Kaspi'));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Тебе переводят по открытому счёту — номер нужен');
  expect(screen.getByLabelText('Номер Kaspi')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
});

test('payment settings reject an invalid number before the server', async () => {
  renderWithApp(<ProfileSettingsSheet section="payment" onClose={close} />, { me: player });
  await userEvent.type(screen.getByLabelText('Номер Kaspi'), 'abc');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Проверь номер');
  expect(api.send).not.toHaveBeenCalled();
});

test('name settings trim the name and preserve it on a taken-name error', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(409, 'name_taken'));
  renderWithApp(<ProfileSettingsSheet section="name" onClose={close} />, { me: player });
  await userEvent.clear(screen.getByLabelText('Имя в списках'));
  await userEvent.type(screen.getByLabelText('Имя в списках'), '  Дамир  ');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/me', { displayName: 'Дамир' });
  expect(await screen.findByRole('alert')).toHaveTextContent('Это имя уже занято — добавь букву фамилии или номер');
  expect(screen.getByLabelText('Имя в списках')).toHaveValue('  Дамир  ');
});

test('football settings start empty, save native choices, and explicitly clear both to null', async () => {
  (api.send as Mock).mockResolvedValue({ ...player, playingPosition: 'defender', dominantFoot: 'right' });
  renderWithApp(<ProfileSettingsSheet section="football" onClose={close} />, { me: player });
  expect(screen.getByLabelText('Позиция на поле')).toHaveValue('');
  expect(screen.getByLabelText('Рабочая нога')).toHaveValue('');
  await userEvent.selectOptions(screen.getByLabelText('Позиция на поле'), 'defender');
  await userEvent.selectOptions(screen.getByLabelText('Рабочая нога'), 'right');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(api.send).toHaveBeenLastCalledWith('PATCH', '/api/me', { playingPosition: 'defender', dominantFoot: 'right' });
  await userEvent.selectOptions(screen.getByLabelText('Позиция на поле'), '');
  await userEvent.selectOptions(screen.getByLabelText('Рабочая нога'), '');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(api.send).toHaveBeenLastCalledWith('PATCH', '/api/me', { playingPosition: null, dominantFoot: null });
});

test('football failure keeps chosen values and permits another save', async () => {
  (api.send as Mock).mockRejectedValue(new Error('offline'));
  renderWithApp(<ProfileSettingsSheet section="football" onClose={close} />, { me: { ...player, playingPosition: 'forward', dominantFoot: 'both' } });
  await userEvent.selectOptions(screen.getByLabelText('Позиция на поле'), 'midfielder');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(await screen.findByText('Не получилось сохранить. Попробуй ещё раз.')).toBeInTheDocument();
  expect(screen.getByLabelText('Позиция на поле')).toHaveValue('midfielder');
  expect(screen.getByLabelText('Рабочая нога')).toHaveValue('both');
  expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
});

test('an in-flight settings save prevents duplicate submissions', async () => {
  (api.send as Mock).mockImplementation(() => new Promise(() => {}));
  renderWithApp(<ProfileSettingsSheet section="football" onClose={close} />, { me: player });
  await userEvent.dblClick(screen.getByRole('button', { name: 'Сохранить' }));
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
});
