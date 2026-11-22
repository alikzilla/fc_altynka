import { teamApiRoute } from './team-fixture';
import { test, expect, type Page } from '@playwright/test';
import { openCreateMatch } from './menu';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const me = { userId: 1, displayName: 'Игрок', role: 'organizer', kaspiPhone: null, community: { id: 1, title: 'Команда' } };
const match = { id: 7, date: '2026-11-08', status: 'collecting', main: [], reserve: [], mainCount: 0, reserveCount: 0, limit: 10, my: null, teams: null, bill: null };

test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await teamApiRoute(page, route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/me' ? me : path === '/api/events' ? { active: [match], past: [] } : path === '/api/notifications' ? { tasks: [] } : path === '/api/matches' ? { events: [], nextCursor: null } : path === '/api/players' ? { groups: [{ community: me.community, role: 'organizer', players: [] }] } : match });
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

// The route skeleton already draws the real heading, so a visible heading alone does not mean the screen
// has mounted. A swipe that starts on the skeleton is lost when the loaded screen replaces it.
async function ready(page: Page, heading: string) {
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Загрузка…' })).toHaveCount(0);
}

async function swipe(page: Page, from: number, to: number, selector = 'main', y = 300) {
  await touch(page, 'touchstart', from, y, selector);
  await touch(page, 'touchmove', (from + to) / 2, y + 2, selector);
  await touch(page, 'touchmove', to, y + 3, selector);
  await touch(page, 'touchend', to, y + 3, selector);
}

for (const [side, from, to] of [['left', 8, 150], ['right', 382, 240]] as const) {
  test(`${side} edge invokes the screen back destination`, async ({ page }) => {
    await page.goto('/players');
    await ready(page, 'Игроки');
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
    await openCreateMatch(page);
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
  await page.goto('/players');
  await ready(page, 'Игроки');
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
  await expect(page).toHaveURL('/players');
  await expect(page.locator('.edge-back-cue[data-active]')).toHaveCount(0);
  await swipe(page, 8, 150);
  await expect(page).toHaveURL('/profile');
});

test('root tabs and gestures starting on inputs do not navigate', async ({ page }) => {
  await page.goto('/players');
  await expect(page.getByRole('searchbox')).toBeVisible();
  await swipe(page, 8, 150, 'input');
  await expect(page).toHaveURL('/players');
  await page.goto('/matches');
  await ready(page, 'Матчи');
  await swipe(page, 8, 150);
  await swipe(page, 382, 240);
  await expect(page).toHaveURL('/matches');
});

test('the add-friend sheet closes back to its match rather than leaving the app', async ({ page }) => {
  await page.goto('/event/7');
  await page.getByRole('button', { name: 'Добавить друга' }).click();
  const sheet = page.getByRole('dialog', { name: 'Привести друга' });
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  await swipe(page, 8, 150, 'dialog', box.y + box.height / 2);
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL('/event/7');
  await swipe(page, 8, 150);
  await expect(page).toHaveURL('/matches');
});

test('trusted touchscreen gestures navigate from both edges and retain native vertical scrolling', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Trusted touch injection uses the Chromium DevTools protocol.');
  const cdp = await page.context().newCDPSession(page);
  for (const [from, direction] of [[8, 1], [382, -1]]) {
    await page.goto('/players');
    await ready(page, 'Игроки');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y: 360 }] });
    for (const distance of [14, 40, 75, 120, 150]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + distance * direction, y: 360 }] });
    }
    await expect(page.locator('.edge-back-cue[data-active]')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page).toHaveURL('/profile');
  }
  await page.goto('/players');
  await ready(page, 'Игроки');
  await page.locator('main').evaluate(main => { main.style.minHeight = '1800px'; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 8, y: 650 }] });
  for (const y of [630, 580, 510, 420, 300]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 8, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(page).toHaveURL('/players');
});

test('saving locks the sheet against edge navigation', async ({ page }) => {
  let finish: (() => Promise<void>) | undefined;
  await page.route('**/api/events', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { active: [match], past: [] } });
    return new Promise<void>(resolve => { finish = async () => { await route.fulfill({ status: 503, json: { error: 'offline' } }); resolve(); }; });
  });
  await page.goto('/profile');
  await openCreateMatch(page);
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
  await page.goto('/players');
  await ready(page, 'Игроки');
  await swipe(page, 8, 150);
  await expect(page).toHaveURL('/profile');
});

// The cue starts half beyond the edge it was pulled from. Past the right edge it must not widen the page
// (or the sheet) into a horizontal scroll, neither during the pull nor after a pull that was let go.
const overflow = (page: Page, selector: string) => page.locator(selector).first().evaluate(node => {
  const scroller = node.tagName === 'DIALOG' ? node : document.documentElement;
  return { width: scroller.scrollWidth - scroller.clientWidth, x: node.tagName === 'DIALOG' ? node.scrollLeft : window.scrollX };
});

test('a pull from the right edge never makes the screen scroll sideways', async ({ page }) => {
  await page.goto('/players');
  await ready(page, 'Игроки');
  await touch(page, 'touchstart', 386, 300);
  expect(await overflow(page, 'main')).toEqual({ width: 0, x: 0 });
  await touch(page, 'touchmove', 370, 301);
  expect(await overflow(page, 'main')).toEqual({ width: 0, x: 0 });
  await touch(page, 'touchmove', 350, 302);
  expect(await overflow(page, 'main')).toEqual({ width: 0, x: 0 });
  // Let go before the threshold: the page stays and still does not scroll sideways.
  await touch(page, 'touchend', 350, 302);
  await expect(page).toHaveURL('/players');
  expect(await overflow(page, 'main')).toEqual({ width: 0, x: 0 });
});

test('a pull from the right edge of a sheet never makes the sheet scroll sideways', async ({ page }) => {
  await page.goto('/profile');
  await openCreateMatch(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect.poll(async () => Math.round((await dialog.boundingBox())!.y + (await dialog.boundingBox())!.height)).toBe(844);
  const box = (await dialog.boundingBox())!;
  const y = box.y + box.height / 2;
  await touch(page, 'touchstart', 386, y, 'dialog');
  await touch(page, 'touchmove', 360, y + 1, 'dialog');
  expect(await overflow(page, 'dialog')).toEqual({ width: 0, x: 0 });
  await touch(page, 'touchend', 360, y + 1, 'dialog');
  await expect(dialog).toBeVisible();
  expect(await overflow(page, 'dialog')).toEqual({ width: 0, x: 0 });
  expect(await overflow(page, 'main')).toEqual({ width: 0, x: 0 });
});
