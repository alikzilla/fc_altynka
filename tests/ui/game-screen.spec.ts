import { test, expect, type Page } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { gameStatisticsWorld } from './game-statistics-fixture';

const NOW = Date.parse('2026-11-08T16:00:00Z');

/** The browser has no speakers or wake lock here: a fake element clock stands in for the track the page builds. */
async function stubMedia(page: Page) {
  await page.addInitScript(() => {
    const state = new WeakMap<HTMLMediaElement, { offset: number; since: number | null }>();
    const of = (el: HTMLMediaElement) => { let s = state.get(el); if (!s) { s = { offset: 0, since: null }; state.set(el, s); } return s; };
    const position = (el: HTMLMediaElement) => { const s = of(el); return s.offset + (s.since === null ? 0 : (performance.now() - s.since) / 1000); };
    const define = (name: string, descriptor: PropertyDescriptor) => Object.defineProperty(HTMLMediaElement.prototype, name, { configurable: true, ...descriptor });
    define('currentTime', { get(this: HTMLMediaElement) { return position(this); }, set(this: HTMLMediaElement, v: number) { const s = of(this); s.offset = v; if (s.since !== null) s.since = performance.now(); } });
    define('paused', { get(this: HTMLMediaElement) { return of(this).since === null; } });
    define('ended', { get() { return false; } });
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const s = of(this);
      if (s.since === null) { s.since = performance.now(); this.dispatchEvent(new Event('playing')); }
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      const s = of(this);
      if (s.since !== null) { s.offset = position(this); s.since = null; this.dispatchEvent(new Event('pause')); }
    };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => Promise.resolve({ released: false, release: () => Promise.resolve(), addEventListener() {}, removeEventListener() {} }) } });
    // The screen is under test here, not decoding: the mixer has unit tests.
    (window as any).OfflineAudioContext = class {
      constructor(public channels: number, public length: number, public sampleRate: number) {}
      decodeAudioData() { return Promise.resolve({ duration: 1, sampleRate: 44100, numberOfChannels: 1, length: 16, getChannelData: () => new Float32Array(16) }); }
      createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
      createBuffer(channels: number, length: number, sampleRate: number) { return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: () => new Float32Array(length) }; }
      get destination() { return {}; }
      startRendering() { return Promise.resolve({ numberOfChannels: 1, length: 16, sampleRate: this.sampleRate, getChannelData: () => new Float32Array(16) }); }
    };
  });
}

const digits = (page: Page) => page.getByRole('timer');
const phase = (page: Page) => page.locator('.game-timer-phase');
const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();

/** Jumps over long stretches in one step, then lets the 250 ms ticks and the 3 s poll run once. */
async function jump(page: Page, ms: number) {
  await page.clock.fastForward(ms);
  await page.clock.runFor(500);
}

async function openOrganizer(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubMedia(page);
  await page.clock.install({ time: NOW });
  const world = gameStatisticsWorld({ started: true });
  await world.attach(page);
  await page.goto('/event/7/game');
  await expect(page.getByRole('heading', { name: 'Игра 1', exact: true })).toBeVisible();
  return world;
}

test('the organizer runs a game: start, phases by the clock, pause, overtime and a result', async ({ page }) => {
  const world = await openOrganizer(page);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await expect(phase(page)).toHaveText('Ждём старта');
  // The running game is a single task two steps from Матчи: no dock, its own Back leads out.
  await expect(page.getByRole('navigation', { name: 'Основная навигация' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Длительность игры' })).toBeVisible();
  await expect(digits(page)).toHaveText('6:00');

  const start = page.getByRole('button', { name: 'Старт игры', exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(phase(page)).toHaveText('Игра идёт');
  await expect.poll(() => world.requests.filter(r => r.path === '/api/events/7/games/timer').length).toBe(1);
  expect(world.requests.find(r => r.path === '/api/events/7/games/timer')!.body)
    .toMatchObject({ gameSequence: 1, durationSec: 360, pausedAt: null, pausedMs: 0 });
  expect(world.timer).toMatchObject({ gameSequence: 1, durationSec: 360 });
  await expect(page.getByRole('group', { name: 'Длительность игры' })).toHaveCount(0);

  await page.clock.runFor(10_000);
  await expect(digits(page)).toHaveText('5:50');
  await expect(phase(page)).toHaveText('Игра идёт');

  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(phase(page)).toHaveText('Пауза');
  await expect.poll(() => world.timer?.pausedAt).not.toBeNull();
  const frozen = await digits(page).textContent();
  await page.clock.runFor(2_000);
  await expect(digits(page)).toHaveText(frozen!);
  await expect(phase(page)).toHaveText('Пауза');

  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(phase(page)).toHaveText('Игра идёт');
  expect(world.timer?.pausedAt).toBeNull();
  const resumed = world.timer!;
  expect(resumed.pausedMs).toBeGreaterThanOrEqual(2000);

  // Remaining 5:50 − 2 s of pause is 5:50 at resume; 0:59 is 291 s later.
  const secondsLeft = async () => { const [m, s] = (await digits(page).textContent())!.split(':').map(Number); return m * 60 + s; };
  await jump(page, (await secondsLeft() - 59) * 1000);
  await expect(phase(page)).toHaveText('Последняя минута');
  await jump(page, (await secondsLeft() - 14) * 1000);
  await expect(phase(page)).toHaveText('Последняя атака');
  await jump(page, 16_000);
  await expect(phase(page)).toHaveText(/^Время \+0:0\d$/);
  await expect(digits(page)).toHaveText('0:00');

  expect((await axe(page)).violations).toEqual([]);

  await page.getByRole('button', { name: 'Внести результат', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Результат игры', exact: true });
  await dialog.locator('.game-score-side').nth(0).getByRole('button', { name: /Добавить гол команды/ }).click();
  await dialog.getByRole('button', { name: 'Сохранить результат', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Игра 2', exact: true })).toBeVisible();
  await expect(phase(page)).toHaveText('Ждём старта');
  expect(world.games).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('the organizer opens the match protocol sheet from the game screen', async ({ page }) => {
  await openOrganizer(page);
  await page.getByRole('button', { name: 'Старт игры', exact: true }).click();
  await expect(phase(page)).toHaveText('Игра идёт');
  await page.getByRole('button', { name: 'Действия', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Протокол матча', exact: true });
  await expect(sheet).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

test('a participant sees the running timer from the server and no controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubMedia(page);
  await page.clock.install({ time: NOW });
  const world = gameStatisticsWorld({ started: true });
  world.setTimer({ gameSequence: 1, durationSec: 360, startedAt: NOW - 10_000, pausedAt: null, pausedMs: 0, updatedAt: NOW - 10_000 });
  await world.attach(page, { manage: false, userId: 2 });
  await page.goto('/event/7/game');
  await expect(page.getByRole('heading', { name: 'Игра 1', exact: true })).toBeVisible();
  await expect(phase(page)).toHaveText('Игра идёт');
  const before = await digits(page).textContent();
  expect(before).toMatch(/^5:[45]\d$/);
  await page.clock.runFor(30_000);
  await expect.poll(async () => digits(page).textContent()).not.toBe(before);
  const [m, s] = (await digits(page).textContent())!.split(':').map(Number);
  expect(m * 60 + s).toBeLessThanOrEqual(325);
  expect(m * 60 + s).toBeGreaterThanOrEqual(318);
  for (const name of ['Старт игры', 'Пауза', 'Продолжить', 'Внести результат']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Длительность игры' })).toHaveCount(0);

  const listen = page.getByRole('button', { name: 'Слышать сигналы', exact: true });
  await expect(listen).toBeEnabled();
  await listen.click();
  const mute = page.getByRole('button', { name: 'Выключить сигналы', exact: true });
  await expect(mute).toBeVisible();
  await mute.click();
  await expect(listen).toBeVisible();

  // A pause set by the organizer reaches the participant through the 3 s poll.
  world.setTimer({ gameSequence: 1, durationSec: 360, startedAt: NOW - 10_000, pausedAt: NOW + 20_000, pausedMs: 0, updatedAt: NOW + 20_000 });
  await page.clock.runFor(4_000);
  await expect(phase(page)).toHaveText('Пауза');
  expect((await axe(page)).violations).toEqual([]);
});
