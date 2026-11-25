import type { EventDetailDto } from '@altynka/core';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { Route } from 'wouter';
import { api } from '../src/lib/api';
import { useGameTimer, type GameTimerView } from '../src/hooks/useGameTimer';
import { GameScreen } from '../src/screens/GameScreen';
import { organizer, player, renderWithApp } from './render';
import { makeProtocol } from './gameFixtures';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));
vi.mock('../src/lib/tg');
vi.mock('../src/hooks/useGameTimer', () => ({ useGameTimer: vi.fn() }));

const HINT = 'Экран не погаснет сам. Можно заблокировать телефон — сигналы прозвучат.';
const base = { id: 7, date: '2026-11-25', status: 'playing', protocolVersion: 1, community: { id: 1, title: 'FC Altynka' }, main: [], reserve: [], teams: null, bill: null } as unknown as EventDetailDto;
const organizerEvent = { ...base, viewerRole: 'organizer', gameProtocol: makeProtocol() } as EventDetailDto;
const played = { id: 'g1', sequence: 1, pair: [0, 1] as [number, number], score: [2, 0] as [number, number], scorers: [], firstRestTeamIndex: 1, recordedAt: 1, recordedBy: 1, updatedAt: 1, updatedBy: 1 };
const playerEvent = { ...base, viewerRole: 'player', gameProtocol: makeProtocol({ canRecord: false, canEdit: false, canUndo: false, canFinish: false }) } as EventDetailDto;

function view(overrides: Partial<GameTimerView> = {}): GameTimerView {
  return {
    status: 'waiting', remainingSec: 360, phase: 'playing', durationSec: 360, setDurationSec: vi.fn(),
    sound: 'off', canControl: true, trackReady: true, trackFailed: false,
    start: vi.fn(async () => {}), pause: vi.fn(), resume: vi.fn(async () => {}), reset: vi.fn(),
    listen: vi.fn(async () => {}), mute: vi.fn(), ...overrides,
  };
}
const settle = async () => { await act(async () => {}); };
function open(ev: EventDetailDto, me = organizer) {
  (api.get as Mock).mockResolvedValue(ev);
  return renderWithApp(<Route path="/event/:id/game"><GameScreen /></Route>, { me, path: '/event/7/game' });
}

beforeEach(() => { (useGameTimer as Mock).mockReturnValue(view()); });
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

test('organizer sees the pair, the rest chip, start and duration, records a result and has three protocol actions', async () => {
  (useGameTimer as Mock).mockReturnValue(view({ status: 'running', remainingSec: 200, durationSec: 360 }));
  open({ ...organizerEvent, gameProtocol: makeProtocol({ canUndo: true, games: [played], currentPair: [0, 2], restingTeamIndex: 1 }) });
  await settle();
  expect(screen.getByRole('heading', { level: 1, name: 'Игра 2' })).toBeVisible();
  const current = screen.getByRole('region', { name: 'Текущая игра' });
  expect(within(current).getByText('3 очка')).toBeVisible();
  expect(within(current).getByText('0 очков')).toBeVisible();
  expect(current).toHaveTextContent('Отдыхают Синие');
  expect(screen.getByRole('table', { name: 'Таблица команд' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Внести результат' }));
  expect(screen.getByRole('dialog', { name: 'Результат игры' })).toBeVisible();
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Результат игры' })).getByRole('button', { name: 'Закрыть' }));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)); });
  await userEvent.click(screen.getByRole('button', { name: 'Действия' }));
  const menu = screen.getByRole('dialog', { name: 'Протокол матча' });
  expect(within(menu).getByRole('button', { name: 'Сбросить таймер' })).toBeVisible();
  expect(within(menu).getByRole('button', { name: 'Отменить последнюю запись' })).toBeVisible();
  expect(within(menu).getByRole('button', { name: 'Завершить матч' })).toBeVisible();
});

test('waiting organizer starts the game and picks its duration with a stepper', async () => {
  const timer = view();
  (useGameTimer as Mock).mockReturnValue(timer);
  open(organizerEvent);
  await settle();
  expect(screen.getByText('Ждём старта')).toBeVisible();
  expect(screen.getByRole('timer')).toHaveTextContent('6:00');
  const stepper = screen.getByRole('group', { name: 'Длительность игры' });
  expect(stepper).toHaveTextContent('6 мин');
  await userEvent.click(within(stepper).getByRole('button', { name: 'Больше' }));
  expect(timer.setDurationSec).toHaveBeenCalledWith(420);
  await userEvent.click(within(stepper).getByRole('button', { name: 'Меньше' }));
  expect(timer.setDurationSec).toHaveBeenCalledWith(300);
  await userEvent.click(screen.getByRole('button', { name: 'Старт игры' }));
  expect(timer.start).toHaveBeenCalled();
  expect(screen.getByText(HINT)).toBeVisible();
});

test('start and resume do not wait for the signals, a failed load is explained, and the reset asks for confirmation', async () => {
  const waiting = view({ trackReady: false, trackFailed: true });
  (useGameTimer as Mock).mockReturnValue(waiting);
  const first = open(organizerEvent);
  await settle();
  expect(screen.getByText('Сигналы не загрузились — проверь интернет')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Старт игры' }));
  expect(waiting.start).toHaveBeenCalled();
  first.unmount();
  const silent = open(organizerEvent);
  (useGameTimer as Mock).mockReturnValue(view({ status: 'running', sound: 'resumable', trackReady: false }));
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(screen.getByRole('button', { name: /^Продолжить сигналы/ })).toBeDisabled();
  expect(screen.queryByText('Сигналы не загрузились — проверь интернет')).toBeNull();
  silent.unmount();
  const timer = view({ status: 'paused', remainingSec: 75.4, trackReady: false });
  (useGameTimer as Mock).mockReturnValue(timer);
  open(organizerEvent);
  await settle();
  expect(screen.getByText('Пауза', { selector: '.game-timer-phase' })).toBeVisible();
  expect(screen.getByRole('timer')).toHaveTextContent('1:16');
  expect(screen.queryByRole('group', { name: 'Длительность игры' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  expect(timer.resume).toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Действия' }));
  const reset = within(screen.getByRole('dialog', { name: 'Протокол матча' })).getByRole('button', { name: 'Сбросить таймер' });
  await userEvent.click(reset);
  expect(timer.reset).not.toHaveBeenCalled();
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Протокол матча' })).getByRole('button', { name: 'Сбросить таймер игры 1?' }));
  expect(timer.reset).toHaveBeenCalled();
});

test('a running organizer pauses, and a restarted phone offers to bring the signals back', async () => {
  const timer = view({ status: 'running', remainingSec: 151.2, phase: 'playing', sound: 'resumable' });
  (useGameTimer as Mock).mockReturnValue(timer);
  open(organizerEvent);
  await settle();
  expect(screen.getByText('Игра идёт')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Пауза' }));
  expect(timer.pause).toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Продолжить сигналы (осталось 2:32)' }));
  expect(timer.listen).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Слышать сигналы' })).toBeNull();
});

test('phases follow the remaining time and added time is counted up', async () => {
  (useGameTimer as Mock).mockReturnValue(view({ status: 'running', remainingSec: 42, phase: 'last_minute', canControl: false, sound: 'on' }));
  const first = open(playerEvent, player);
  await settle();
  expect(screen.getByText('Последняя минута')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Выключить сигналы' })).toBeVisible();
  first.unmount();
  (useGameTimer as Mock).mockReturnValue(view({ status: 'running', remainingSec: 9, phase: 'last_attack', canControl: false }));
  const second = open(playerEvent, player);
  await settle();
  expect(screen.getByText('Последняя атака')).toBeVisible();
  second.unmount();
  (useGameTimer as Mock).mockReturnValue(view({ status: 'running', remainingSec: -12.4, phase: 'over', canControl: false, sound: 'on' }));
  open(playerEvent, player);
  await settle();
  expect(screen.getByRole('region', { name: 'Таймер игры' })).toHaveTextContent('0:00Время +0:12');
  expect(screen.getByRole('timer')).toHaveTextContent('0:00');
  expect(screen.queryByRole('button', { name: /сигналы/ })).toBeNull();
});

test('participant sees the digits and can hear the signals, without organizer controls', async () => {
  const timer = view({ status: 'running', remainingSec: 154.3, canControl: false });
  (useGameTimer as Mock).mockReturnValue(timer);
  open(playerEvent, player);
  await settle();
  expect(screen.getByRole('timer')).toHaveTextContent('2:35');
  expect(screen.getByText('Игра идёт')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Слышать сигналы' }));
  expect(timer.listen).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Старт игры' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Пауза' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Внести результат' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Действия' })).toBeNull();
  expect(screen.queryByRole('group', { name: 'Длительность игры' })).toBeNull();
});

test('a waiting participant has no signal button', async () => {
  (useGameTimer as Mock).mockReturnValue(view({ canControl: false }));
  open(playerEvent, player);
  await settle();
  expect(screen.getByText('Ждём старта')).toBeVisible();
  expect(screen.queryByRole('button', { name: /сигналы/ })).toBeNull();
});

test('the hint is shown once', async () => {
  const first = open(organizerEvent);
  await settle();
  expect(screen.getByText(HINT)).toBeVisible();
  first.unmount();
  open(organizerEvent);
  await settle();
  expect(screen.queryByText(HINT)).toBeNull();
});

test('a match that is not being played leads back to the games tab', async () => {
  const { history } = open({ ...organizerEvent, gameProtocol: makeProtocol({ state: 'completed', currentPair: null, completedAt: 2, canRecord: false, canFinish: false }) });
  await settle();
  expect(history.at(-1)).toBe('/event/7?tab=games');
  expect(useGameTimer).not.toHaveBeenCalled();
});

test('an event without a game protocol leads back to the games tab', async () => {
  const { history } = open({ ...base, viewerRole: 'player', gameProtocol: undefined } as EventDetailDto, player);
  await settle();
  expect(history.at(-1)).toBe('/event/7?tab=games');
});

test('back returns to the games tab', async () => {
  open(organizerEvent);
  await settle();
  expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute('href', '/event/7?tab=games');
});

test('the screen refreshes every 3 seconds only while visible', async () => {
  vi.useFakeTimers();
  open(playerEvent, player);
  await settle();
  const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
  const count = (api.get as Mock).mock.calls.length;
  await advance(3000);
  expect(api.get).toHaveBeenCalledTimes(count + 1);
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  try {
    await advance(9000);
    expect(api.get).toHaveBeenCalledTimes(count + 1);
    visibility.mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(api.get).toHaveBeenCalledTimes(count + 2);
  } finally { visibility.mockRestore(); }
});

test('a participant sees the hint once the signals play on the phone', async () => {
  (useGameTimer as Mock).mockReturnValue(view({ status: 'running', remainingSec: 200, canControl: false }));
  const first = open(playerEvent, player);
  await settle();
  expect(screen.queryByText(HINT)).toBeNull();
  (useGameTimer as Mock).mockReturnValue(view({ status: 'running', remainingSec: 199, canControl: false, sound: 'on' }));
  // The real hook re-renders when the audio starts; here the next refresh does.
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(screen.getByText(HINT)).toBeVisible();
  first.unmount();
  open(playerEvent, player);
  await settle();
  expect(screen.queryByText(HINT)).toBeNull();
});
