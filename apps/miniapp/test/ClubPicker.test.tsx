import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { applyClub, getClubId } from '../src/lib/theme';
import { ClubPickerSheet } from '../src/components/ClubPicker';
import { player, renderWithApp } from './render';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});
beforeEach(() => { (api.send as Mock).mockReset(); (api.send as Mock).mockResolvedValue({ ...player }); });
afterEach(() => { cleanup(); act(() => applyClub(null)); });

const tiles = () => [...document.querySelectorAll('.club-grid:not(.sheet-stack-hidden) button')] as HTMLElement[];
function open(onClose = vi.fn()) {
  renderWithApp(<ClubPickerSheet onClose={onClose} />, { me: player });
  return onClose;
}

test('opens on clubs/all without a club and lists every club tile', () => {
  open();
  expect(screen.getByRole('tab', { name: 'Клубы' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute('aria-pressed', 'true');
  expect(tiles()).toHaveLength(20);
  expect(screen.queryByRole('button', { name: 'Казахстан' })).toBeNull();
  expect(screen.getByText('Список клубов будет пополняться')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Без клуба' })).toHaveAttribute('aria-pressed', 'true');
});

test('«Без клуба» is named by its text and described by «Обычная тема»', () => {
  open();
  const none = screen.getByRole('button', { name: 'Без клуба' });
  expect(none).not.toHaveAttribute('aria-label');
  expect(none).toHaveAccessibleDescription('Обычная тема');
});

test('league chip filters', async () => {
  open();
  await userEvent.click(screen.getByRole('button', { name: 'Ла Лига' }));
  expect(tiles().map(t => t.textContent)).toEqual(['Реал Мадрид', 'Барселона', 'Атлетико']);
});

test('national teams tab has no league chips', async () => {
  open();
  await userEvent.click(screen.getByRole('tab', { name: 'Сборные' }));
  expect(tiles()).toHaveLength(5);
  expect(screen.queryByRole('button', { name: 'АПЛ' })).toBeNull();
});

test("opens on the current club's section", () => {
  act(() => applyClub('kairat'));
  open();
  expect(screen.getByRole('button', { name: 'КПЛ' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Кайрат' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Без клуба' })).toHaveAttribute('aria-pressed', 'false');
  cleanup();
  act(() => applyClub('brazil'));
  open();
  expect(screen.getByRole('tab', { name: 'Сборные' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: 'Бразилия' })).toHaveAttribute('aria-pressed', 'true');
});

test('choosing applies at once, closes and saves', async () => {
  (api.send as Mock).mockReturnValue(new Promise(() => {}));
  const onClose = open();
  await userEvent.click(screen.getByRole('button', { name: 'Барселона' }));
  expect(getClubId()).toBe('barcelona');
  expect(onClose).toHaveBeenCalled();
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/me', { favoriteClub: 'barcelona' });
});

test('Без клуба saves null', async () => {
  act(() => applyClub('kairat'));
  open();
  await userEvent.click(screen.getByRole('button', { name: 'Без клуба' }));
  expect(getClubId()).toBeNull();
  expect(api.send).toHaveBeenCalledWith('PATCH', '/api/me', { favoriteClub: null });
});

test('failure rolls back to the previous club with a toast', async () => {
  act(() => applyClub('kairat'));
  (api.send as Mock).mockRejectedValue(new Error('offline'));
  open();
  await userEvent.click(screen.getByRole('button', { name: 'Все' }));
  await userEvent.click(screen.getByRole('button', { name: 'Барселона' }));
  expect(await screen.findByText('Не получилось сохранить клуб')).toBeInTheDocument();
  expect(getClubId()).toBe('kairat');
});

test('a stale failure does not undo a newer choice', async () => {
  let rejectFirst!: (e: Error) => void;
  (api.send as Mock)
    .mockReturnValueOnce(new Promise((_, reject) => { rejectFirst = reject; }))
    .mockResolvedValueOnce({ ...player, favoriteClub: 'milan' });
  open();
  await userEvent.click(screen.getByRole('button', { name: 'Барселона' }));
  cleanup();
  open();
  await userEvent.click(screen.getByRole('button', { name: 'Все' }));
  await userEvent.click(screen.getByRole('button', { name: 'Милан' }));
  await act(async () => { rejectFirst(new Error('offline')); });
  expect(getClubId()).toBe('milan');
  expect(within(document.body).queryByText('Не получилось сохранить клуб')).toBeNull();
});

test('the grid is held at the height of every club, by an invisible copy nobody can reach', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: 'АПЛ' }));
  const ghost = document.querySelector('.club-grid.sheet-stack-hidden')!;
  expect(ghost.querySelectorAll('button')).toHaveLength(20);
  expect(ghost).toHaveAttribute('aria-hidden', 'true');
  expect(ghost.hasAttribute('inert')).toBe(true);
  expect(tiles()).toHaveLength(6);
});

test('the league row stays mounted but hidden for national teams', () => {
  open();
  fireEvent.click(screen.getByRole('tab', { name: 'Сборные' }));
  const row = document.querySelector('.club-leagues')!;
  expect(row).toHaveClass('club-leagues-hidden');
  expect(row.hasAttribute('inert')).toBe(true);
});
