import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const me = { userId: 1, displayName: 'Игрок', role: 'organizer', kaspiPhone: null, community: { id: 1, title: 'Команда' } };
const match = { id: 7, date: '2026-11-08', status: 'collecting', main: [], reserve: [], mainCount: 0, reserveCount: 0, limit: 10, my: null, teams: null, bill: null };

test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/me' ? me : path === '/api/events' ? { active: [match], past: [] } : path === '/api/notifications' ? { tasks: [] } : path === '/api/matches' ? { events: [], nextCursor: null } : match });
  });
});

async function touch(page: Page, type: string, x: number, y: number, selector = 'main', count = 1) {
  await page.locator(selector).evaluate((target, { type, x, y, count }) => {
    // WebKit does not expose constructible Touch objects to automation.
    const touches = type === 'touchend' || type === 'touchcancel' ? [] : Array.from({ length: count }, (_, identifier) => ({ identifier, target, clientX: x + identifier * 5, clientY: y }));
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: [{ identifier: 0, target, clientX: x, clientY: y }] } });
    target.dispatchEvent(event);
  }, { type, x, y, count });
}

async function swipe(page: Page, from: number, to: number, selector = 'main', y = 300) {
  await touch(page, 'touchstart', from, y, selector);
  await touch(page, 'touchmove', (from + to) / 2, y + 2, selector);
  await touch(page, 'touchmove', to, y + 3, selector);
  await touch(page, 'touchend', to, y + 3, selector);
}

for (const [side, from, to] of [['left', 8, 150], ['right', 382, 240]] as const) {
  test(`${side} edge invokes the screen back destination`, async ({ page }) => {
    await page.goto('/profile/settings/name');
    await expect(page.getByRole('heading', { name: 'Имя в списках', exact: true })).toBeVisible();
    await touch(page, 'touchstart', from, 300);
    await touch(page, 'touchmove', to, 302);
    await expect(page.locator('.edge-back-cue[data-active]')).toBeVisible();
    await expect(page.locator('.edge-back-cue[data-active]')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `artifacts/ui/edge-back-${side}.png` });
    await touch(page, 'touchend', to, 302);
    await expect(page).toHaveURL('/profile');
    await expect(page.getByRole('heading', { name: 'Профиль', exact: true })).toBeVisible();
  });

  test(`${side} edge closes the top sheet and preserves the background`, async ({ page }) => {
    await page.goto('/profile');
    await page.getByRole('link', { name: 'Создать матч', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(async () => {
      const box = (await page.getByRole('dialog').boundingBox())!;
      return Math.round(box.y + box.height);
    }).toBe(844);
    const box = (await page.getByRole('dialog').boundingBox())!;
    await swipe(page, from, to, 'dialog', box.y + box.height / 2);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL('/profile');
  });
}

test('short pulls, reversals, vertical movement, multitouch and cancelled gestures stay on the page', async ({ page }) => {
  await page.goto('/profile/settings/name');
  await expect(page.getByRole('heading', { name: 'Имя в списках', exact: true })).toBeVisible();
  await swipe(page, 8, 27);
  await swipe(page, 180, 340);
  await touch(page, 'touchstart', 8, 300);
  await touch(page, 'touchmove', 11, 440);
  await touch(page, 'touchend', 11, 440);
  await touch(page, 'touchstart', 8, 300);
  await touch(page, 'touchmove', 130, 300);
  await touch(page, 'touchmove', 25, 300);
  await touch(page, 'touchend', 25, 300);
  await touch(page, 'touchstart', 8, 300);
  await touch(page, 'touchmove', 130, 300);
  await touch(page, 'touchcancel', 130, 300);
  await touch(page, 'touchstart', 8, 300);
  await touch(page, 'touchmove', 130, 300, 'main', 2);
  await touch(page, 'touchend', 130, 300);
  await expect(page).toHaveURL('/profile/settings/name');
  await expect(page.locator('.edge-back-cue[data-active]')).toHaveCount(0);
  await swipe(page, 8, 150);
  await expect(page).toHaveURL('/profile');
});

test('root tabs and gestures starting on inputs do not navigate', async ({ page }) => {
  await page.goto('/profile/settings/name');
  await expect(page.getByLabel('Имя в списках')).toBeVisible();
  await swipe(page, 8, 150, 'input');
  await expect(page).toHaveURL('/profile/settings/name');
  await page.goto('/matches');
  await expect(page.getByRole('heading', { name: 'Матчи', exact: true })).toBeVisible();
  await swipe(page, 8, 150);
  await swipe(page, 382, 240);
  await expect(page).toHaveURL('/matches');
});

test('nested match screen returns to its match rather than leaving the app', async ({ page }) => {
  await page.goto('/event/7/guest');
  await expect(page.getByRole('heading', { name: 'Привести друга', exact: true })).toBeVisible();
  await swipe(page, 382, 240);
  await expect(page).toHaveURL('/event/7');
  await swipe(page, 8, 150);
  await expect(page).toHaveURL('/matches');
});

test('trusted touchscreen gestures navigate from both edges and retain native vertical scrolling', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Trusted touch injection uses the Chromium DevTools protocol.');
  const cdp = await page.context().newCDPSession(page);
  for (const [from, direction] of [[8, 1], [382, -1]]) {
    await page.goto('/profile/settings/name');
    await expect(page.getByRole('heading', { name: 'Имя в списках', exact: true })).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y: 360 }] });
    for (const distance of [14, 40, 75, 120, 150]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + distance * direction, y: 360 }] });
    }
    await expect(page.locator('.edge-back-cue[data-active]')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page).toHaveURL('/profile');
  }
  await page.goto('/profile/settings/name');
  await expect(page.getByRole('heading', { name: 'Имя в списках', exact: true })).toBeVisible();
  await page.locator('main').evaluate(main => { main.style.minHeight = '1800px'; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 8, y: 650 }] });
  for (const y of [630, 580, 510, 420, 300]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 8, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(page).toHaveURL('/profile/settings/name');
});

test('saving locks the sheet against edge navigation', async ({ page }) => {
  let finish: (() => Promise<void>) | undefined;
  await page.route('**/api/events', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { active: [match], past: [] } });
    return new Promise<void>(resolve => { finish = async () => { await route.fulfill({ status: 503, json: { error: 'offline' } }); resolve(); }; });
  });
  await page.goto('/profile');
  await page.getByRole('link', { name: 'Создать матч', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Создать матч', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Создаём матч…' })).toBeDisabled();
  const box = (await dialog.boundingBox())!;
  await swipe(page, 8, 150, 'dialog', box.y + box.height / 2);
  await swipe(page, 382, 240, 'dialog', box.y + box.height / 2);
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL('/new');
  await expect.poll(() => Boolean(finish)).toBe(true);
  await finish!();
  await expect(dialog.getByRole('button', { name: 'Создать матч', exact: true })).toBeEnabled();
});

test('reduced motion keeps back navigation available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/profile/settings/name');
  await expect(page.getByRole('heading', { name: 'Имя в списках', exact: true })).toBeVisible();
  await swipe(page, 8, 150);
  await expect(page).toHaveURL('/profile');
});
