import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemSettings } from '../src/screens/SystemSettings';
import { ready, type HomeScreenStatus } from '../src/lib/tg';
import { player, renderWithApp } from './render';

type Listener = () => void;
function telegram({ platform = 'ios', version = true, status = 'missed' as HomeScreenStatus | null, fullscreen = false } = {}) {
  const listeners = new Map<string, Listener>();
  const app = {
    platform, isFullscreen: fullscreen, ready: vi.fn(), expand: vi.fn(),
    isVersionAtLeast: () => version,
    onEvent: (name: string, callback: Listener) => listeners.set(name, callback),
    offEvent: (name: string) => listeners.delete(name),
    requestFullscreen: vi.fn(() => { app.isFullscreen = true; }),
    exitFullscreen: vi.fn(() => { app.isFullscreen = false; }),
    addToHomeScreen: vi.fn(),
    ...(status ? { checkHomeScreenStatus: (callback: (s: HomeScreenStatus) => void) => callback(status) } : {}),
  };
  Object.defineProperty(window, 'Telegram', { configurable: true, value: { WebApp: app } });
  return { app, listeners };
}

beforeEach(() => localStorage.clear());
afterEach(() => Reflect.deleteProperty(window, 'Telegram'));

test('on a phone the app opens full screen; the switch turns it off for this device and back on', async () => {
  const { app } = telegram();
  ready();
  expect(app.requestFullscreen).toHaveBeenCalledTimes(1);
  renderWithApp(<SystemSettings />, { me: player });
  const toggle = screen.getByRole('switch', { name: 'Во весь экран' });
  expect(toggle).toBeChecked();
  await userEvent.click(toggle);
  expect(app.exitFullscreen).toHaveBeenCalledTimes(1);
  expect(screen.getByText('С верхней панелью Telegram')).toBeInTheDocument();
  // The next launch on this phone remembers the choice.
  ready();
  expect(app.requestFullscreen).toHaveBeenCalledTimes(1);
  await userEvent.click(toggle);
  expect(app.requestFullscreen).toHaveBeenCalledTimes(2);
});

test('computers and older clients keep the window and show no full-screen switch', () => {
  for (const options of [{ platform: 'tdesktop' }, { platform: 'ios', version: false }]) {
    const { app } = telegram(options);
    ready();
    expect(app.requestFullscreen).not.toHaveBeenCalled();
    const { unmount } = renderWithApp(<SystemSettings />, { me: player });
    expect(screen.queryByRole('switch', { name: 'Во весь экран' })).not.toBeInTheDocument();
    unmount();
  }
});

test('the home-screen icon can be added once and then reads as added', async () => {
  const { app, listeners } = telegram();
  renderWithApp(<SystemSettings />, { me: player });
  await userEvent.click(screen.getByRole('button', { name: /Иконка на главном экране.*Добавить/ }));
  expect(app.addToHomeScreen).toHaveBeenCalledTimes(1);
  act(() => listeners.get('homeScreenAdded')?.());
  expect(screen.getByText('Иконка ФК Алтынка на главном экране')).toBeInTheDocument();
  expect(screen.getByText('Уже добавлена: ФК Алтынка открывается прямо с экрана телефона')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Добавить/ })).not.toBeInTheDocument();
});

test('an icon added earlier shows as added; unsupported clients and the browser show nothing', () => {
  telegram({ status: 'added' });
  const first = renderWithApp(<SystemSettings />, { me: player });
  expect(screen.getByText('Уже добавлена: ФК Алтынка открывается прямо с экрана телефона')).toBeInTheDocument();
  first.unmount();
  telegram({ status: 'unsupported' });
  const second = renderWithApp(<SystemSettings />, { me: player });
  expect(screen.queryByText('Иконка на главном экране')).not.toBeInTheDocument();
  second.unmount();
  Reflect.deleteProperty(window, 'Telegram');
  renderWithApp(<SystemSettings />, { me: player });
  expect(screen.queryByText('Иконка на главном экране')).not.toBeInTheDocument();
  expect(screen.queryByRole('switch', { name: 'Во весь экран' })).not.toBeInTheDocument();
});

test('the notifications switch moves at the tap and moves back when the server refuses', async () => {
  let reject!: (error: Error) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise((_, fail) => { reject = fail; })));
  renderWithApp(<SystemSettings />, { me: { ...player, notifications: { enabled: true, available: true } } });
  const toggle = screen.getByRole('switch', { name: 'Уведомления' });
  await userEvent.click(toggle);
  expect(toggle).not.toBeChecked();
  expect(screen.getByText('Личные уведомления выключены')).toBeInTheDocument();
  await act(async () => reject(new TypeError('offline')));
  expect(toggle).toBeChecked();
  expect(await screen.findByText('Не получилось изменить уведомления. Попробуй ещё раз.')).toBeInTheDocument();
  vi.unstubAllGlobals();
});

test('the privacy policy opens from the settings through Telegram', async () => {
  const { app } = telegram();
  const openLink = vi.fn();
  Object.assign(app, { openLink });
  renderWithApp(<SystemSettings />, { me: player });
  await userEvent.click(screen.getByRole('button', { name: /Политика конфиденциальности/ }));
  expect(openLink).toHaveBeenCalledWith(`${location.origin}/privacy.html`);
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
    renderWithApp(<SystemSettings />, { me: player });
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

  test('the receiver of an open bill learns what to do first; nothing is deleted', async () => {
    telegram();
    stubDelete(Response.json({ error: 'receiver_open_bill' }, { status: 409 }));
    renderWithApp(<SystemSettings />, { me: player });
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
    renderWithApp(<SystemSettings />, { me: player });
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
    renderWithApp(<SystemSettings />, { me: player });
    await userEvent.click(screen.getByRole('button', { name: /Сообщить о проблеме/ }));
    await userEvent.type(screen.getByLabelText('Что случилось?'), 'Снова');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Подожди полминуты');
    expect(screen.getByLabelText('Что случилось?')).toHaveValue('Снова');
  });
});
