import { test, expect, type Page, type CDPSession } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
const identity = { userId: 1, displayName: 'Организатор', role: 'organizer', kaspiPhone: null, community: { id: 4, title: 'Футбол по субботам' } };
const draft = { id: 7, date: '2026-11-08', status: 'collecting', startTime: null, durationHours: null, place: null, limit: 10, mainCount: 0, reserveCount: 0, my: null, comment: null, main: [], reserve: [], teams: null, bill: null };

test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/me' ? identity : path === '/api/events' ? { active: [], past: [] } : path === '/api/matches' ? { events: [], nextCursor: null } : path === '/api/notifications' ? { tasks: [] } : (path === '/api/members' || path === '/api/players') ? [] : draft });
  });
});
async function openSheet(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Создать матч' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height)).toBe(844);
  return sheet;
}
async function touch(cdp: CDPSession, type: string, x: number, y: number) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }] });
}
async function swipe(cdp: CDPSession, x: number, y: number, dx: number, dy: number) {
  await touch(cdp, 'touchStart', x, y);
  for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', x + dx * i / 6, y + dy * i / 6);
  await touch(cdp, 'touchEnd', 0, 0);
}

test('sheet rises from the bottom and follows a downward touch before dismissing', async ({ page }) => {
  const sheet = await openSheet(page);
  const cdp = await page.context().newCDPSession(page);
  const grabber = page.locator('.sheet-drag-area');
  await expect(grabber).toBeVisible();
  const box = (await grabber.boundingBox())!;
  const start = (await sheet.boundingBox())!.y;
  await page.screenshot({ path: 'artifacts/ui/bottom-sheet-390.png' });
  await touch(cdp, 'touchStart', 195, box.y + 16);
  await touch(cdp, 'touchMove', 195, box.y + 70);
  await expect.poll(async () => (await sheet.boundingBox())!.y).toBeGreaterThan(start + 45);
  await page.screenshot({ path: 'artifacts/ui/sheet-dragging-390.png' });
  await touch(cdp, 'touchMove', 195, box.y + 156);
  await touch(cdp, 'touchEnd', 0, 0);
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL('/');
});

test('short, horizontal, cancelled and multi-touch gestures reset cleanly and the next swipe works', async ({ page }) => {
  const sheet = await openSheet(page);
  const cdp = await page.context().newCDPSession(page);
  const grabber = page.locator('.sheet-drag-area');
  const box = (await grabber.boundingBox())!;
  const origin = (await sheet.boundingBox())!.y;
  await swipe(cdp, 150, box.y + 16, 0, 20);
  await expect(sheet).toBeVisible();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y)).toBe(Math.round(origin));
  await swipe(cdp, 100, box.y + 16, 100, 8);
  await expect(sheet).toBeVisible();
  await touch(cdp, 'touchStart', 150, box.y + 16);
  await touch(cdp, 'touchMove', 150, box.y + 80);
  await touch(cdp, 'touchCancel', 0, 0);
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y)).toBe(Math.round(origin));
  await touch(cdp, 'touchStart', 150, box.y + 16);
  await touch(cdp, 'touchMove', 150, box.y + 60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: box.y + 60, id: 1 }, { x: 250, y: box.y + 70, id: 2 }] });
  await touch(cdp, 'touchCancel', 0, 0);
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y)).toBe(Math.round(origin));
  await swipe(cdp, 195, box.y + 16, 0, 150);
  await expect(sheet).toHaveCount(0);
});

test('form scrolls on a short phone and a downward content swipe dismisses only at scroll-top', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/new');
  const sheet = page.getByRole('dialog');
  const body = page.locator('.sheet-content');
  await expect(body).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height)).toBe(568);
  await page.screenshot({ path: 'artifacts/ui/bottom-sheet-320.png' });
  const box = (await body.boundingBox())!;
  await swipe(cdp, 8, box.y + box.height - 30, 0, -150);
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(sheet).toBeVisible();
  await body.evaluate(el => { el.scrollTop = 100; });
  await swipe(cdp, 8, box.y + 50, 0, 130);
  await expect(sheet).toBeVisible();
  await body.evaluate(el => { el.scrollTop = 0; });
  await swipe(cdp, 8, box.y + 35, 0, 140);
  await expect(sheet).toHaveCount(0);
});

test('mouse drag can dismiss; lost capture and blur do not leave the sheet stuck', async ({ page }) => {
  const sheet = await openSheet(page);
  const grabber = page.locator('.sheet-drag-area');
  const box = (await grabber.boundingBox())!;
  const origin = (await sheet.boundingBox())!.y;
  await page.mouse.move(195, box.y + 16);
  await page.mouse.down();
  await page.mouse.move(195, box.y + 70, { steps: 5 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y)).toBe(Math.round(origin));
  await sheet.evaluate(el => el.addEventListener('gotpointercapture', event => { (el as HTMLElement).dataset.pointerId = String((event as PointerEvent).pointerId); }, { once: true }));
  await page.mouse.move(195, box.y + 16);
  await page.mouse.down();
  await page.mouse.move(195, box.y + 70, { steps: 5 });
  await sheet.evaluate(el => el.releasePointerCapture(Number((el as HTMLElement).dataset.pointerId)));
  await page.mouse.up();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y)).toBe(Math.round(origin));
  await page.mouse.move(195, box.y + 16);
  await page.mouse.down();
  await page.mouse.move(195, box.y + 160, { steps: 8 });
  await page.mouse.up();
  await expect(sheet).toHaveCount(0);
});

test('pending submission ignores swipe dismiss and reduced-motion still supports touch', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/events', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    await pending;
    await route.fulfill({ json: { id: 7 } });
  });
  const sheet = await openSheet(page);
  const box = (await page.locator('.sheet-drag-area').boundingBox())!;
  await sheet.getByLabel('Дата', { exact: true }).fill('2026-11-08');
  await sheet.getByRole('button', { name: 'Создать матч' }).click();
  await expect(sheet.getByRole('button', { name: 'Создаём матч…' })).toBeDisabled();
  const cdp = await page.context().newCDPSession(page);
  await swipe(cdp, 195, box.y + 16, 0, 150);
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(el => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)');
  release();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL('/matches');
  await page.getByRole('navigation').getByRole('link', { name: 'Создать матч' }).click();
  const next = (await page.locator('.sheet-drag-area').boundingBox())!;
  await swipe(cdp, 195, next.y + 16, 0, 150);
  await expect(sheet).toHaveCount(0);
});

test('dragging horizontally or selecting text into the backdrop does not dismiss the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 844 });
  const sheet = await openSheet(page);
  const header = (await page.locator('.sheet-drag-area').boundingBox())!;
  await page.mouse.move(header.x + 50, header.y + 16);
  await page.mouse.down();
  await page.mouse.move(20, header.y + 16, { steps: 10 });
  await page.mouse.up();
  await expect(sheet).toBeVisible();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height)).toBe(844);
  const textarea = sheet.getByLabel(/Комментарий/);
  await textarea.fill('Светлые и тёмные футболки');
  const field = (await textarea.boundingBox())!;
  await page.mouse.move(field.x + 40, field.y + 25);
  await page.mouse.down();
  await page.mouse.move(20, field.y + 25, { steps: 10 });
  await page.mouse.up();
  await expect(sheet).toBeVisible();
  await expect(textarea).toHaveValue('Светлые и тёмные футболки');
  await page.mouse.click(20, 100);
  await expect(sheet).toHaveCount(0);
});

for (const width of [320, 390]) {
  test(`empty states use quiet contextual content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/', '/matches', '/matches?view=past', '/notifications', '/event/7?tab=teams', '/players']) {
      await page.goto(path);
      const empty = page.locator('.empty-state');
      await expect(empty).toBeVisible();
      await expect(empty.locator('.empty-icon')).toHaveCount(0);
      expect(await empty.evaluate(el => getComputedStyle(el).textAlign)).toBe('left');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: `artifacts/ui/empty-${width}-${path.replace(/[^a-z0-9]+/gi, '-')}.png`, fullPage: true });
      if (path === '/') await expect(page.getByRole('heading', { name: 'Нужно сделать' })).toHaveCount(0);
    }
    await page.route('**/api/me', route => route.fulfill({ json: { ...identity, role: 'player' } }));
    await page.goto('/matches');
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Создать матч' })).toHaveCount(0);
    await page.goto('/notifications');
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.getByText('Игры без назначенного времени')).toHaveCount(0);
  });
}
