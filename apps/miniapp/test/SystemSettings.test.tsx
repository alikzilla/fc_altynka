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
  expect(screen.getByText('Иконка FC Altynka на главном экране')).toBeInTheDocument();
  expect(screen.getByText('Уже добавлена: FC Altynka открывается прямо с экрана телефона')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Добавить/ })).not.toBeInTheDocument();
});

test('an icon added earlier shows as added; unsupported clients and the browser show nothing', () => {
  telegram({ status: 'added' });
  const first = renderWithApp(<SystemSettings />, { me: player });
  expect(screen.getByText('Уже добавлена: FC Altynka открывается прямо с экрана телефона')).toBeInTheDocument();
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
