import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api, ApiError } from '../src/lib/api';
import { Profile } from '../src/screens/Profile';
import { organizer, player, renderWithApp, twoGroups } from './render';
import { requestWriteAccess, openTelegramLink } from '../src/lib/tg';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

test('profile shows three direct edit actions and two system switches without an intermediate menu', () => {
  renderWithApp(<Profile />, { me: { ...player, profileCompleted: true, theme: 'dark' } });
  expect(screen.getByRole('heading', { name: 'Настройка профиля' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Изменить имя/ })).toHaveAttribute('href', '/profile/settings/name');
  expect(screen.getByRole('link', { name: /Изменить оплату/ })).toHaveAttribute('href', '/profile/settings/payment');
  expect(screen.getByRole('link', { name: /Изменить футбольные данные/ })).toHaveAttribute('href', '/profile/settings/football');
  expect(screen.getByRole('heading', { name: 'Системные настройки' })).toBeInTheDocument();
  expect(screen.getAllByRole('switch')).toHaveLength(2);
  expect(screen.getByRole('switch', { name: 'Тёмная тема' })).toBeChecked();
  expect(screen.getByRole('switch', { name: 'Уведомления' })).not.toBeChecked();
  expect(screen.queryByRole('heading', { name: 'Управление' })).not.toBeInTheDocument();
  // A player's players link sits under a neutral heading, never «Команда».
  expect(screen.getByRole('heading', { name: 'Игроки' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Команда' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /^Игроки/ })).toHaveAttribute('href', '/players');
});

test('theme switch saves the actual preference and rolls back a failed save', async () => {
  document.documentElement.dataset.theme = 'dark';
  (api.send as Mock).mockRejectedValue(new Error('offline'));
  renderWithApp(<Profile />, { me: { ...player, profileCompleted: true, theme: 'dark' } });
  await userEvent.click(screen.getByRole('switch', { name: 'Тёмная тема' }));
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/me', { theme: 'light' });
  expect(await screen.findByText('Не получилось сохранить тему. Попробуй ещё раз.')).toBeInTheDocument();
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(screen.getByRole('switch', { name: 'Тёмная тема' })).toBeChecked();
});

test('permission availability does not opt a player into notifications', () => {
  renderWithApp(<Profile />, { me: { ...player, notifications: { enabled: false, available: true } } });
  expect(screen.getByRole('heading', { name: 'Системные настройки' })).toBeInTheDocument();
  expect(screen.getByText('Личные уведомления выключены')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Уведомления' })).toBeInTheDocument();
  expect(api.send).not.toHaveBeenCalled();
});

test('explicit enable with existing permission saves only the preference', async () => {
  (api.send as Mock).mockResolvedValue({ ...player, notifications: { enabled: true, available: true } });
  renderWithApp(<Profile />, { me: { ...player, notifications: { enabled: false, available: true } } });
  await userEvent.click(screen.getByRole('switch', { name: 'Уведомления' }));
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/me', { notificationsEnabled: true });
  expect(requestWriteAccess).not.toHaveBeenCalled();
  expect(await screen.findByText('Личные уведомления включены')).toBeInTheDocument();
});

test('enabling requests native permission before saving and does not submit profile edits', async () => {
  (requestWriteAccess as Mock).mockResolvedValue(true);
  (api.send as Mock).mockResolvedValue({ ...player, notifications: { enabled: true, available: true } });
  renderWithApp(<Profile />, { me: { ...player, notifications: { enabled: false, available: false } } });
  await userEvent.type(screen.getByLabelText('Имя в списках'), ' черновик');
  await userEvent.click(screen.getByRole('switch', { name: 'Уведомления' }));
  expect(requestWriteAccess).toHaveBeenCalledOnce();
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/me', { notificationsEnabled: true });
  expect(screen.getByLabelText('Имя в списках')).toHaveValue('Игрок черновик');
  expect(await screen.findByText('Личные уведомления включены')).toBeInTheDocument();
});

test('declining Telegram permission keeps notifications disabled', async () => {
  (requestWriteAccess as Mock).mockResolvedValue(false);
  renderWithApp(<Profile />, { me: { ...player, notifications: { enabled: false, available: false } } });
  await userEvent.click(screen.getByRole('switch', { name: 'Уведомления' }));
  expect(api.send).not.toHaveBeenCalled();
  expect(openTelegramLink).not.toHaveBeenCalled();
  expect(screen.getByText('Личные уведомления выключены')).toBeInTheDocument();
});

test('unsupported clients open bot settings without pretending to enable notifications', async () => {
  (requestWriteAccess as Mock).mockResolvedValue(null);
  renderWithApp(<Profile />, { me: { ...player, notifications: { enabled: false, available: false } } });
  await userEvent.click(screen.getByRole('switch', { name: 'Уведомления' }));
  expect(openTelegramLink).toHaveBeenCalledWith('https://t.me/fc_altynka_bot?start=settings');
  expect(api.send).not.toHaveBeenCalled();
  expect(screen.getByText('Личные уведомления выключены')).toBeInTheDocument();
});

test('unverified native grant falls back to bot settings without a false enabled state', async () => {
  (requestWriteAccess as Mock).mockResolvedValue(true);
  (api.send as Mock).mockRejectedValue(new ApiError(409, 'write_access_required'));
  renderWithApp(<Profile />, { me: { ...player, notifications: { enabled: false, available: false } } });
  await userEvent.click(screen.getByRole('switch', { name: 'Уведомления' }));
  expect(openTelegramLink).toHaveBeenCalledWith('https://t.me/fc_altynka_bot?start=settings');
  expect(screen.getByText('Личные уведомления выключены')).toBeInTheDocument();
});

test('notification network error keeps actual state and allows retry', async () => {
  (api.send as Mock).mockRejectedValue(new Error('offline'));
  renderWithApp(<Profile />, { me: { ...player, notifications: { enabled: false, available: true } } });
  await userEvent.click(screen.getByRole('switch', { name: 'Уведомления' }));
  expect(await screen.findByText('Не получилось изменить уведомления. Попробуй ещё раз.')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Уведомления' })).toBeEnabled();
  expect(screen.getByText('Личные уведомления выключены')).toBeInTheDocument();
});

test('a blocked bot is shown separately from the enabled preference and can be disabled', async () => {
  (api.send as Mock).mockResolvedValue({ ...player, notifications: { enabled: false, available: false } });
  renderWithApp(<Profile />, { me: { ...player, notifications: { enabled: true, available: false } } });
  expect(screen.getByText('Личные уведомления включены')).toBeInTheDocument();
  expect(screen.getByText('Бот пока не может писать тебе. Разреши сообщения в Telegram.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('switch', { name: 'Уведомления' }));
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/me', { notificationsEnabled: false });
  expect(requestWriteAccess).not.toHaveBeenCalled();
  expect(await screen.findByText('Личные уведомления выключены')).toBeInTheDocument();
});

test('declining restored access never claims an existing subscription was disabled', async () => {
  (requestWriteAccess as Mock).mockResolvedValue(false);
  renderWithApp(<Profile />, { me: { ...player, notifications: { enabled: true, available: false } } });
  await userEvent.click(screen.getByRole('button', { name: 'Разрешить сообщения' }));
  expect(api.send).not.toHaveBeenCalled();
  expect(screen.getByText('Личные уведомления включены')).toBeInTheDocument();
  expect(screen.queryByText(/Уведомления остаются выключены/)).not.toBeInTheDocument();
});

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
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/me', { displayName: 'Дамир', kaspiPhone: '+77071234567', profileCompleted: true });
});

test('receiver of an open bill is told why the phone cannot be cleared', async () => {
  (api.send as Mock).mockRejectedValue(new ApiError(409, 'receiver_needs_phone'));
  renderWithApp(<Profile />, { me: { ...organizer, profileCompleted: false } });
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

test('initial setup keeps submitted fields stable while saving and disappears only after acceptance', async () => {
  let complete!: (value: unknown) => void;
  (api.send as Mock).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  renderWithApp(<Profile />, { me: { ...player, profileCompleted: false } });
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/me', { displayName: 'Игрок', kaspiPhone: null, profileCompleted: true });
  expect(screen.getByLabelText('Имя в списках')).toBeInTheDocument();
  expect(screen.getByLabelText('Имя в списках')).toBeDisabled();
  expect(screen.getByLabelText('Номер Kaspi')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
  await act(async () => complete({ ...player, profileCompleted: true }));
  expect(screen.queryByLabelText('Имя в списках')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Номер Kaspi')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Изменить имя/ })).toHaveAttribute('href', '/profile/settings/name');
});

test('failed setup preserves both drafts and can be retried', async () => {
  (api.send as Mock).mockRejectedValue(new Error('offline'));
  renderWithApp(<Profile />, { me: { ...player, profileCompleted: false } });
  await userEvent.clear(screen.getByLabelText('Имя в списках'));
  await userEvent.type(screen.getByLabelText('Имя в списках'), 'Дамир');
  await userEvent.type(screen.getByLabelText('Номер Kaspi'), '8 707 123 45 67');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(await screen.findByText('Не получилось сохранить. Попробуй ещё раз.')).toBeInTheDocument();
  expect(screen.getByLabelText('Имя в списках')).toHaveValue('Дамир');
  expect(screen.getByLabelText('Номер Kaspi')).toHaveValue('8 707 123 45 67');
  expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
});

test.each([
  { ...player, profileCompleted: true, kaspiPhone: null },
  { ...player, kaspiPhone: '+77071234567' },
])('completed and legacy returning profiles show summary instead of setup', me => {
  renderWithApp(<Profile />, { me });
  expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Номер Kaspi')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Профиль игрока' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Изменить имя/ })).toHaveAttribute('href', '/profile/settings/name');
});

test('football summary uses real values and offers editing without assigning defaults', () => {
  renderWithApp(<Profile />, { me: { ...player, profileCompleted: true, playingPosition: 'goalkeeper', dominantFoot: 'left' } });
  expect(screen.getByText('Вратарь')).toBeInTheDocument();
  expect(screen.getByRole('img', {name:'Левая нога'})).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Изменить имя/ })).toHaveAttribute('href', '/profile/settings/name');
});

test('with one group the role line shows only the role, without the group name', () => {
  renderWithApp(<Profile />, { me: { ...player, profileCompleted: true, communities: [{ id: 1, title: 'Очень длинное название футбольной группы', role: 'admin' }] } });
  expect(screen.getByText('Администратор')).toHaveClass('player-role');
  expect(screen.queryByText(/Очень длинное название/)).toBeNull();
});

test('with two groups the role line has no group name and history rows carry group tags', async () => {
  (api.get as Mock).mockResolvedValue({ history: [{ eventId: 3, date: '2026-11-01', place: null, score: 7, community: { id: 2, title: 'Футбол по средам' } }] });
  renderWithApp(<Profile />, { me: { ...twoGroups, profileCompleted: true, rating: { value: 5, initial: 5, selfAssessment: null, matchesCount: 0 }, communities: [{ id: 1, title: 'FC Altynka', role: 'organizer' }, { id: 2, title: 'Футбол по средам', role: 'player' }] } });
  expect(screen.getByText('Организатор')).toHaveClass('player-role');
  expect(screen.getByText('Организатор').textContent).not.toMatch(/FC Altynka/);
  expect(await screen.findByText('Футбол по средам')).toBeInTheDocument();
});
