import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileHelp } from '../src/components/ProfileHelp';
import { applyClub, getClubId } from '../src/lib/theme';
import { player, renderWithApp } from './render';

/** A minimal Telegram WebApp: what the help section and its sheets touch. */
function telegram() {
  const app = { platform: 'ios', ready: vi.fn(), expand: vi.fn(), isVersionAtLeast: () => true, onEvent: vi.fn(), offEvent: vi.fn(), openLink: vi.fn(), BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() } };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: app } });
  return { app };
}

afterEach(() => Reflect.deleteProperty(window, 'Telegram'));

test('the section reads like profile settings, then a separate red delete row and the version close the page', () => {
  telegram();
  renderWithApp(<ProfileHelp />, { me: player });
  const nav = screen.getByRole('navigation', { name: 'Помощь и данные' });
  expect(nav.querySelectorAll('button')).toHaveLength(2);
  expect(screen.getByRole('button', { name: /Сообщить о проблеме/ })).toBeVisible();
  expect(screen.getByRole('button', { name: /Политика конфиденциальности/ })).toBeVisible();
  // The destructive action is not one of the section's rows.
  expect(nav).not.toContainElement(screen.getByRole('button', { name: /Удалить мои данные/ }));
  expect(screen.getByText(/^Версия dev/)).toBeInTheDocument();
});

test('the privacy policy opens through Telegram', async () => {
  const { app } = telegram();
  const openLink = vi.fn();
  Object.assign(app, { openLink });
  renderWithApp(<ProfileHelp />, { me: player });
  await userEvent.click(screen.getByRole('button', { name: /Политика конфиденциальности/ }));
  expect(openLink).toHaveBeenCalledWith(`${location.origin}/privacy`);
});

describe('delete my data', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubDelete = (response: Response) => {
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  test('explains what goes and what stays, deletes after one confirmation and offers to close the app', async () => {
    const { app } = telegram();
    const close = vi.fn();
    Object.assign(app, { close });
    const fetchMock = stubDelete(Response.json({ deleted: true }));
    renderWithApp(<ProfileHelp />, { me: player });
    await userEvent.click(screen.getByRole('button', { name: /Удалить мои данные/ }));
    const sheet = screen.getByRole('dialog', { name: 'Удалить мои данные?' });
    expect(sheet).toHaveTextContent('Удалённый игрок');
    expect(sheet).toHaveTextContent('Отменить удаление нельзя');
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Удалить навсегда' }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method, init.body]).toEqual(['/api/me', 'DELETE', JSON.stringify({ confirm: 'delete' })]);
    expect(await screen.findByRole('dialog', { name: 'Данные удалены' })).toBeVisible();
    await userEvent.click(screen.getAllByRole('button', { name: 'Закрыть приложение' }).at(-1)!);
    expect(close).toHaveBeenCalled();
  });

  test('deleting the data forgets the favourite club on this device', async () => {
    telegram();
    applyClub('barcelona');
    stubDelete(Response.json({ deleted: true }));
    renderWithApp(<ProfileHelp />, { me: { ...player, favoriteClub: 'barcelona' } });
    await userEvent.click(screen.getByRole('button', { name: /Удалить мои данные/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить навсегда' }));
    expect(await screen.findByRole('dialog', { name: 'Данные удалены' })).toBeVisible();
    expect(getClubId()).toBeNull();
    expect(localStorage.getItem('altynka:club')).toBeNull();
  });

  test('a failed deletion keeps the club', async () => {
    telegram();
    applyClub('barcelona');
    stubDelete(Response.json({ error: 'receiver_open_bill' }, { status: 409 }));
    renderWithApp(<ProfileHelp />, { me: player });
    await userEvent.click(screen.getByRole('button', { name: /Удалить мои данные/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить навсегда' }));
    await screen.findByRole('alert');
    expect(getClubId()).toBe('barcelona');
    applyClub(null);
  });

  test('the receiver of an open bill learns what to do first; nothing is deleted', async () => {
    telegram();
    stubDelete(Response.json({ error: 'receiver_open_bill' }, { status: 409 }));
    renderWithApp(<ProfileHelp />, { me: player });
    await userEvent.click(screen.getByRole('button', { name: /Удалить мои данные/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Удалить навсегда' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Попроси организатора закрыть счёт');
    expect(screen.getByRole('dialog', { name: 'Удалить мои данные?' })).toBeVisible();
  });
});

describe('report a problem', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('the text goes to the developer with the screen and the version; the sheet closes with thanks', async () => {
    telegram();
    const fetchMock = vi.fn(async () => Response.json({ sent: true }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithApp(<ProfileHelp />, { me: player });
    expect(screen.getByText(/^Версия dev/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Сообщить о проблеме/ }));
    const send = screen.getByRole('button', { name: 'Отправить' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Что случилось?'), '  Не обновился список  ');
    await userEvent.click(send);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/feedback');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Не обновился список', path: '/', version: 'dev' });
    expect(await screen.findByText('Отправили. Спасибо!')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Сообщить о проблеме' })).not.toBeInTheDocument();
  });

  test('too often: the text stays and the person learns when to retry', async () => {
    telegram();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'too_often' }, { status: 429 })));
    renderWithApp(<ProfileHelp />, { me: player });
    await userEvent.click(screen.getByRole('button', { name: /Сообщить о проблеме/ }));
    await userEvent.type(screen.getByLabelText('Что случилось?'), 'Снова');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Подожди полминуты');
    expect(screen.getByLabelText('Что случилось?')).toHaveValue('Снова');
  });
});
