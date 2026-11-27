import { teamApiRoute } from './team-fixture';
import { test, expect, type Page, type CDPSession } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { openCreateMatch } from './menu';
import { expectStableSheet, sheetHeight } from './sheet-height';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
const identity = { userId: 1, displayName: 'Организатор', role: 'organizer', kaspiPhone: null, community: { id: 4, title: 'Футбол по субботам' } };
const draft = { id: 7, date: '2026-11-08', status: 'collecting', startTime: null, durationHours: null, place: null, limit: 10, mainCount: 0, reserveCount: 0, my: null, comment: null, main: [], reserve: [], teams: null, bill: null };

test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await teamApiRoute(page, route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/me' ? identity : path === '/api/events' ? { active: [], past: [] } : path === '/api/matches' ? { events: [], nextCursor: null } : path === '/api/notifications' ? { tasks: [] } : (path === '/api/members' || path === '/api/players') ? [] : draft });
  });
});
async function openSheet(page: Page) {
  await page.goto('/');
  await openCreateMatch(page);
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
  // Two creatable groups: the picker makes the form taller than a short phone.
  await page.route('**/api/me', route => route.fulfill({ json: { userId: 1, displayName: 'Организатор', kaspiPhone: null, communities: [{ id: 4, title: 'Футбол по субботам', role: 'organizer' }, { id: 5, title: 'Друзья с работы', role: 'organizer' }] } }));
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
  // The sheet types 2026-11-08 as a future match date; keep «today» before it.
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+05:00'));
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
  await sheet.getByRole('button', { name: 'Создать матч' }).click();
  await expect(sheet.getByRole('button', { name: 'Создаём матч…' })).toBeDisabled();
  const cdp = await page.context().newCDPSession(page);
  await swipe(cdp, 195, box.y + 16, 0, 150);
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(el => getComputedStyle(el).transform)).toBe('matrix(1, 0, 0, 1, 0, 0)');
  release();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL('/matches');
  await openCreateMatch(page);
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

test('an open sheet grows with its content and never shrinks back; drag close and reopen still work', async ({ page }) => {
  const sheet = await openSheet(page);
  const initial = await sheetHeight(page, sheet);
  const content = page.locator('.sheet-content');
  await content.evaluate(el => { const extra = document.createElement('div'); extra.id = 'extra'; extra.style.height = '160px'; el.append(extra); });
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.height)).toBe(Math.round(initial + 160));
  // The content gets shorter again: the sheet keeps its height, its footer edge stays on the screen's bottom.
  await expectStableSheet(page, sheet, () => content.evaluate(el => el.querySelector('#extra')!.remove()), { uncapped: true });
  expect(Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height)).toBe(844);
  expect(await content.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const grabber = (await page.locator('.sheet-drag-area').boundingBox())!;
  await swipe(cdp, 195, grabber.y + 16, 0, 160);
  await expect(sheet).toHaveCount(0);
  // A reopened sheet is a new dialog at its own natural height.
  await openCreateMatch(page);
  await expect(sheet).toBeVisible();
  expect(Math.abs(await sheetHeight(page, sheet) - initial)).toBeLessThanOrEqual(1);
});

/**
 * No browser here has a virtual keyboard: move the visual viewport the way a phone does when the keyboard opens
 * (shorter, and on iOS sometimes panned by offsetTop) and fire its events, so useBottomSheet measures it for real.
 */
async function moveVisualViewport(page: Page, height: number | null, offsetTop = 0): Promise<string[]> {
  return page.evaluate(([height, offsetTop]) => {
    const visual = window.visualViewport!;
    // Transitions the sheet starts in reply, recorded in the same task that moves the viewport: a later look at
    // getAnimations() can miss a short transition that has already ended on a loaded machine.
    const started: string[] = [];
    const record = (event: TransitionEvent) => {
      const target = event.target as Element;
      if (!target.matches('.create-sheet')) return;
      const transition = target.getAnimations().find((a): a is CSSTransition => a instanceof CSSTransition && a.transitionProperty === event.propertyName);
      started.push(`${event.propertyName} ${transition ? transition.effect!.getTiming().duration as number : '?'}`);
    };
    document.addEventListener('transitionrun', record);
    Object.defineProperty(visual, 'height', { configurable: true, get: () => height ?? innerHeight });
    Object.defineProperty(visual, 'offsetTop', { configurable: true, get: () => offsetTop });
    visual.dispatchEvent(new Event('resize'));
    visual.dispatchEvent(new Event('scroll'));
    // The sheet applies the change in the next frame; return once its transition has started.
    return new Promise<string[]>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { document.removeEventListener('transitionrun', record); resolve(started); })));
  }, [height, offsetTop] as const);
}
/** Keyboard tests also run on mobile WebKit (the `webkit-sheets` project); they use no Chromium-only CDP. */
const KEYBOARD = { tag: '@keyboard' };
const keyboardPadding = (sheet: import('@playwright/test').Locator) => sheet.evaluate(el => getComputedStyle(el).paddingBottom);
/** The part of the sheet above the keyboard: its box minus the keyboard padding at the bottom. */
async function visiblePart(sheet: import('@playwright/test').Locator) {
  const box = (await sheet.boundingBox())!;
  return { top: box.y, bottom: box.y + box.height - parseFloat(await keyboardPadding(sheet)), box };
}

test('the keyboard squeezes a sheet below its remembered height; the sheet stays on the bottom and comes back to the same height', KEYBOARD, async ({ page }) => {
  const sheet = await openSheet(page);
  await sheet.getByLabel(/Комментарий/).focus();
  const initial = await sheetHeight(page, sheet);
  const visible = Math.round(initial * .6);
  await moveVisualViewport(page, visible);
  await sheetHeight(page, sheet);
  const { top, bottom, box } = await visiblePart(sheet);
  // Anchored: the bottom edge stays on the window's bottom, the background goes on under the keys.
  expect(Math.round(box.y + box.height)).toBe(844);
  expect(await keyboardPadding(sheet)).toBe(`${844 - visible}px`);
  // The part above the keys fits in what is left of the screen, below the top gap.
  expect(top).toBeGreaterThanOrEqual(12);
  expect(Math.round(bottom)).toBe(visible);
  expect(bottom - top).toBeLessThanOrEqual(visible - 12);
  expect(await page.locator('.sheet-content').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(sheet.getByLabel(/Комментарий/)).toBeFocused();
  // The keyboard goes away: the same transition takes the sheet back to the height it had.
  await moveVisualViewport(page, null);
  expect(Math.abs(await sheetHeight(page, sheet) - initial)).toBeLessThanOrEqual(1);
  expect(await keyboardPadding(sheet)).toBe('0px');
});

test('report a problem with the keyboard open: the field and «Отправить» stay above the keys, the height comes back', KEYBOARD, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await teamApiRoute(page, route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/me'
    ? { userId: 2, displayName: 'Тимур', role: 'player', kaspiPhone: null, profileCompleted: true, notifications: { enabled: false, available: true } }
    : { tasks: [] } }));
  await page.goto('/profile');
  // A Face ID iPhone: 34 px of bottom safe area, which belongs under the keys once the keyboard is open.
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-bottom', '34px'));
  await page.getByRole('button', { name: /Сообщить о проблеме/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Сообщить о проблеме' });
  const initial = await sheetHeight(page, sheet);
  const footer = sheet.locator('.sheet-footer');
  expect(await footer.evaluate(el => getComputedStyle(el).paddingBottom)).toBe('54px');
  const field = sheet.getByLabel('Что случилось?');
  await field.fill('Список не обновился после записи');
  // A 300 px keyboard; iOS also pans the visual viewport a little.
  // The keyboard padding grows over ~250 ms rather than jumping (its animated copy --sheet-pad).
  const transition = await moveVisualViewport(page, 667 - 300 - 20, 20);
  expect(transition).toContain('--sheet-pad 250');
  await sheetHeight(page, sheet);
  const { top, bottom, box } = await visiblePart(sheet);
  expect(Math.round(box.y + box.height)).toBe(667);
  expect(await keyboardPadding(sheet)).toBe('300px');
  expect(Math.round(bottom)).toBe(667 - 300);
  expect(top).toBeGreaterThanOrEqual(20 + 12);
  await expect(field).toBeFocused();
  const send = (await sheet.getByRole('button', { name: 'Отправить' }).boundingBox())!;
  expect(send.y).toBeGreaterThanOrEqual(top);
  expect(send.y + send.height).toBeLessThanOrEqual(bottom + .5);
  // No safe-area gap above the keys: the footer ends on the keyboard's top, the button 20 px above it.
  const foot = (await footer.boundingBox())!;
  expect(Math.abs(foot.y + foot.height - (667 - 300))).toBeLessThanOrEqual(2);
  expect(Math.abs(send.y + send.height + 20 - (667 - 300))).toBeLessThanOrEqual(2);
  const content = (await page.locator('.sheet-content').boundingBox())!;
  const area = (await field.boundingBox())!;
  expect(area.y).toBeGreaterThanOrEqual(content.y - .5);
  expect(Math.min(area.y + area.height, content.y + content.height)).toBeGreaterThan(area.y + 24);
  await page.screenshot({ path: 'artifacts/ui/report-problem-keyboard-390.png' });
  // The keyboard closes; iOS 26 may leave offsetTop where it was, the padding still goes back to 0.
  await moveVisualViewport(page, null, 20);
  expect(Math.abs(await sheetHeight(page, sheet) - initial)).toBeLessThanOrEqual(1);
  expect(await keyboardPadding(sheet)).toBe('0px');
  expect(Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height)).toBe(667);
});

test('a field covered by the keyboard is scrolled into view inside the sheet, never the page', KEYBOARD, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  const sheet = page.getByRole('dialog');
  await page.goto('/');
  await openCreateMatch(page);
  await sheetHeight(page, sheet);
  const comment = sheet.getByLabel(/Комментарий/);
  await comment.focus();
  await moveVisualViewport(page, 667 - 320);
  await sheetHeight(page, sheet);
  const content = page.locator('.sheet-content');
  const inView = async () => {
    const area = (await comment.boundingBox())!;
    const box = (await content.boundingBox())!;
    return area.y >= box.y - .5 && area.y + Math.min(area.height, 40) <= box.y + box.height + .5;
  };
  await expect.poll(inView).toBe(true);
  expect(await content.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  // With the keyboard already open, focusing another field (without the browser's own scrolling) also reveals it.
  await content.evaluate(el => { el.scrollTop = 0; });
  await comment.evaluate(el => { (el as HTMLElement).blur(); (el as HTMLElement).focus({ preventScroll: true }); });
  await expect.poll(inView).toBe(true);
  expect(await page.evaluate(() => [scrollY, document.scrollingElement!.scrollTop])).toEqual([0, 0]);
});

test('with reduced motion the keyboard padding applies at once, without a transition', KEYBOARD, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const sheet = await openSheet(page);
  await sheet.getByLabel(/Комментарий/).focus();
  await moveVisualViewport(page, 500);
  const state = await sheet.evaluate(el => new Promise<{ transitions: number; padding: string }>(resolve => requestAnimationFrame(() => resolve({
    transitions: el.getAnimations().filter(a => a instanceof CSSTransition).length, padding: getComputedStyle(el).paddingBottom,
  }))));
  expect(state).toEqual({ transitions: 0, padding: '344px' });
});

test('dragging and closing never animate the keyboard padding', KEYBOARD, async ({ page }) => {
  const sheet = await openSheet(page);
  await moveVisualViewport(page, 500);
  await sheetHeight(page, sheet);
  expect(await sheet.evaluate(el => { el.dataset.dragging = 'true'; const value = getComputedStyle(el).transitionProperty; delete el.dataset.dragging; return value; })).toBe('none');
  expect(await sheet.evaluate(el => { el.dataset.closing = 'true'; const value = getComputedStyle(el).transitionProperty; delete el.dataset.closing; return value; })).toBe('transform');
});

test('a long list never makes the sheet taller than a 600 px window; it scrolls inside', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/');
  await openCreateMatch(page);
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  const content = page.locator('.sheet-content');
  await content.evaluate(el => {
    const list = document.createElement('ul');
    list.id = 'long-list';
    for (let i = 1; i <= 40; i++) { const row = document.createElement('li'); row.textContent = `Игрок ${i}`; row.style.padding = '12px 0'; list.append(row); }
    el.append(list);
  });
  const height = await sheetHeight(page, sheet);
  const box = (await sheet.boundingBox())!;
  expect(height).toBeLessThanOrEqual(600 - 12);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(Math.round(box.y + box.height)).toBe(600);
  // Capped: the remembered height is the box itself, never the list's full height.
  expect(await sheet.evaluate(el => parseFloat(el.style.getPropertyValue('--sheet-min')) || 0)).toBeLessThanOrEqual(600 - 12);
  await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByText('Игрок 40')).toBeInViewport();
});

for (const width of [320, 390]) {
  test(`empty states use quiet contextual content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/', '/matches', '/matches?view=past', '/notifications', '/event/7?tab=teams', '/players']) {
      await page.goto(path);
      const empty = page.locator('.empty-state');
      await expect(empty).toBeVisible();
      await expect(empty.locator('.empty-icon')).toHaveCount(0);
      // Match tabs use the quiet centred form with the tab's glyph; other screens stay left-aligned without one.
      const matchTab = path.startsWith('/event/');
      await expect(empty.locator('.empty-state-icon')).toHaveCount(matchTab ? 1 : 0);
      expect(await empty.evaluate(el => getComputedStyle(el).textAlign)).toBe(matchTab ? 'center' : 'left');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: `artifacts/ui/empty-${width}-${path.replace(/[^a-z0-9]+/gi, '-')}.png`, fullPage: true });
      if (path === '/') await expect(page.getByRole('heading', { name: 'Нужно сделать' })).toHaveCount(0);
    }
    await page.route('**/api/me', route => route.fulfill({ json: { userId: 1, displayName: 'Организатор', kaspiPhone: null, communities: [{ id: 4, title: 'Футбол по субботам', role: 'player' }] } }));
    await page.goto('/matches');
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Создать матч' })).toHaveCount(0);
    await page.goto('/new');
    await expect(page.getByRole('dialog').getByText(/Создавать матчи может организатор/)).toBeVisible();
    await page.getByRole('button', { name: 'Закрыть создание матча' }).click();
    await page.goto('/notifications');
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.getByText('Игры без назначенного времени')).toHaveCount(0);
  });
}
