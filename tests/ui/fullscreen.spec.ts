import { teamApiRoute } from './team-fixture';
import { test, expect, type Page } from '@playwright/test';

// Telegram on a recent iPhone in full screen: the status bar and Dynamic Island (safe area), then a row with
// Telegram's own «Закрыть» and «⋯» buttons (content safe area). The app must keep its content below both.
const SAFE_TOP = 59;
const CONTENT_TOP = 46;
const SAFE_BOTTOM = 34;

const me = { userId: 2, displayName: 'Игрок', kaspiPhone: null, profileCompleted: true, communities: [{ id: 1, title: 'Команда', role: 'organizer' }], notifications: { enabled: true, available: true }, theme: 'dark' };
const ev = { id: 7, community: { id: 1, title: 'Команда' }, viewerRole: 'organizer', date: '2026-11-25', status: 'scheduled', startTime: '20:00', durationHours: 2, place: 'Arena', comment: null, limit: 10, mainCount: 1, reserveCount: 0, my: 'main',
  main: [{ id: 1, seq: 1, userId: 2, name: 'Игрок', invitedByUserId: null, guestOfName: null }], reserve: [], teams: null, bill: null };

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function fullscreenTelegram(page: Page, homeScreen = 'missed') {
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await page.addInitScript(({ SAFE_TOP, CONTENT_TOP, SAFE_BOTTOM, homeScreen }) => {
    const calls: string[] = [];
    const listeners: Record<string, () => void> = {};
    (window as unknown as { tgCalls: string[]; tgListeners: Record<string, () => void> }).tgCalls = calls;
    (window as unknown as { tgListeners: Record<string, () => void> }).tgListeners = listeners;
    const app = {
      initData: '', initDataUnsafe: {}, platform: 'ios', isFullscreen: false,
      isVersionAtLeast: () => true, ready() {}, expand() {}, disableVerticalSwipes() {},
      setHeaderColor() {}, setBackgroundColor() {}, setBottomBarColor() {},
      onEvent: (name: string, callback: () => void) => { listeners[name] = callback; },
      offEvent: (name: string) => { delete listeners[name]; },
      openLink() {}, openTelegramLink() {},
      requestFullscreen() {
        calls.push('requestFullscreen'); app.isFullscreen = true;
        const root = document.documentElement.style;
        root.setProperty('--tg-safe-area-inset-top', `${SAFE_TOP}px`);
        root.setProperty('--tg-content-safe-area-inset-top', `${CONTENT_TOP}px`);
        root.setProperty('--tg-safe-area-inset-bottom', `${SAFE_BOTTOM}px`);
      },
      exitFullscreen() {
        calls.push('exitFullscreen'); app.isFullscreen = false;
        for (const name of ['--tg-safe-area-inset-top', '--tg-content-safe-area-inset-top', '--tg-safe-area-inset-bottom']) document.documentElement.style.removeProperty(name);
      },
      addToHomeScreen() { calls.push('addToHomeScreen'); },
      checkHomeScreenStatus(callback: (status: string) => void) { callback(homeScreen); },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
      BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    };
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: app };
  }, { SAFE_TOP, CONTENT_TOP, SAFE_BOTTOM, homeScreen });
  await teamApiRoute(page, route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/me' ? me : path === '/api/notifications' ? { tasks: [] } : path === '/api/events' ? { active: [ev], past: [] }
      : path === '/api/matches' ? { events: [], nextCursor: null } : path.startsWith('/api/events/7') ? ev : path === '/api/feed' ? { posts: [] } : {} });
  });
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { tgCalls: string[] }).tgCalls);

for (const [route, heading] of [['/', /матч/i], ['/matches', 'Матчи'], ['/event/7', '25 ноября'], ['/profile', 'Профиль']] as const) {
  test(`full screen keeps ${route} clear of the status bar and Telegram's buttons`, async ({ page }) => {
    await fullscreenTelegram(page);
    await page.goto(route);
    const title = page.getByRole('heading', { level: 1, name: heading });
    await expect(title).toBeVisible();
    expect(await calls(page)).toContain('requestFullscreen');
    // The header row (back button, title and actions) starts below Telegram's own buttons.
    const header = (await page.locator('.screen-heading').boundingBox())!;
    expect(header.y).toBeGreaterThanOrEqual(SAFE_TOP + CONTENT_TOP);
    // The dock stays above the home indicator.
    const dock = (await page.getByRole('navigation', { name: 'Основная навигация' }).boundingBox())!;
    expect(dock.y + dock.height).toBeLessThanOrEqual(844 - SAFE_BOTTOM);
  });
}

test('a sheet in full screen stops below Telegram\'s buttons', async ({ page }) => {
  await fullscreenTelegram(page);
  await page.goto('/profile/settings/name');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height)).toBe(844);
  expect((await sheet.boundingBox())!.y).toBeGreaterThanOrEqual(SAFE_TOP + CONTENT_TOP);
});

test('settings add the home-screen icon and turn full screen off for this phone', async ({ page }) => {
  await fullscreenTelegram(page);
  await page.goto('/profile');
  const add = page.getByRole('button', { name: /Иконка на главном экране.*Добавить/ });
  await add.scrollIntoViewIfNeeded();
  await add.click();
  expect(await calls(page)).toContain('addToHomeScreen');
  await page.evaluate(() => (window as unknown as { tgListeners: Record<string, () => void> }).tgListeners.homeScreenAdded?.());
  await expect(page.getByText('Уже добавлена: ФК Алтынка открывается прямо с экрана телефона')).toBeVisible();

  const toggle = page.getByRole('switch', { name: 'Во весь экран' });
  await expect(toggle).toBeChecked();
  await toggle.click({ force: true });
  expect(await calls(page)).toContain('exitFullscreen');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Профиль' })).toBeVisible();
  expect(await calls(page)).not.toContain('requestFullscreen');
});
