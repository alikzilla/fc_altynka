import { teamApiRoute } from './team-fixture';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const identity = { userId: 1, displayName: 'Организатор', role: 'organizer', kaspiPhone: '+77071234567', community: { id: 4, title: 'Футбол по субботам' } };
const player = { id: 1, seq: 1, userId: 1, name: 'Организатор', invitedByUserId: null, guestOfName: null, level: 5 };
const draft = { id: 7, date: '2026-11-08', status: 'collecting', startTime: null, durationHours: null, place: null, limit: 10, mainCount: 1, reserveCount: 0, my: 'main', comment: null, main: [player], reserve: [], teams: null, bill: null };

test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await teamApiRoute(page, route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/me' ? identity : path === '/api/events' ? { active: [draft], past: [] } : path === '/api/matches' ? { events: [{ ...draft, id: 2, status: 'closed', date: '2026-10-31' }], nextCursor: null } : path === '/api/notifications' ? { tasks: [] } : (path === '/api/members' || path === '/api/players') ? [] : draft });
  });
});

test('bottom sheet preserves context, traps focus, dismisses and restores focus to the trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/profile');
  const trigger = page.getByRole('link', { name: 'Создать матч', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Новый матч' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toBeFocused();
  await expect(dialog.getByLabel('Группа')).toHaveValue('4');
  await expect(dialog.getByLabel('Группа')).toContainText('Футбол по субботам');
  await expect(page.locator('main .title')).toHaveText('Профиль');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await expect.poll(async () => { const box = (await dialog.boundingBox())!; return Math.round(box.y + box.height); }).toBe(844);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await dialog.getByRole('heading').focus();
  await page.screenshot({ path: 'artifacts/ui/ux-create-390.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL('/profile');
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await trigger.click();
  await page.mouse.click(195, 20);
  await expect(dialog).toHaveCount(0);
});

test('creation retains input after error, prevents duplicate submits, and opens active matches', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  let attempts = 0;
  let created = false;
  let finish: (() => void) | undefined;
  const payloads: unknown[] = [];
  await page.route('**/api/events', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { active: created ? [draft] : [], past: [] } });
    attempts++;
    payloads.push(route.request().postDataJSON());
    if (attempts === 1) return route.fulfill({ status: 503, json: { error: 'offline' } });
    await new Promise<void>(resolve => { finish = resolve; });
    created = true;
    await route.fulfill({ json: { id: 7 } });
  });
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Создать матч' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Дата', { exact: true }).fill('2026-11-08');
  await dialog.getByLabel(/Комментарий/).fill('Берём светлые футболки');
  await dialog.getByRole('button', { name: 'Создать матч' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Не получилось создать матч');
  await expect(dialog.getByLabel(/Комментарий/)).toHaveValue('Берём светлые футболки');
  await dialog.getByRole('button', { name: 'Создать матч' }).click();
  await expect(dialog.getByRole('button', { name: 'Создаём матч…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(attempts).toBe(2);
  await expect.poll(() => Boolean(finish)).toBe(true);
  finish!();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL('/matches');
  await expect(page.getByRole('tab', { name: 'Активные' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: /8 ноября/ })).toBeVisible();
  expect(payloads).toEqual(Array(2).fill({ date: '2026-11-08', communityId: 4, comment: 'Берём светлые футболки' }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('matches keyboard tabs separate upcoming games from past matches', async ({ page }) => {
  await page.goto('/matches');
  await expect(page.getByRole('link', { name: /8 ноября/ })).toBeVisible();
  const active = page.getByRole('tab', { name: 'Активные' });
  await active.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Прошлые' })).toBeFocused();
  await expect(page.getByRole('link', { name: /31 октября/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /8 ноября/ })).toHaveCount(0);
  await expect(page).toHaveURL('/matches?view=past');
  await page.screenshot({ path: 'artifacts/ui/ux-matches-past.png', fullPage: true });
  await page.keyboard.press('Home');
  await expect(active).toBeFocused();
  await expect(page.getByRole('link', { name: /8 ноября/ })).toBeVisible();
  await page.screenshot({ path: 'artifacts/ui/ux-matches-active.png', fullPage: true });
});

test('sheet preserves past matches and bill query in its background', async ({ page }) => {
  for (const path of ['/matches?view=past', '/event/7?tab=bill']) {
    await page.goto(path);
    const tab = page.getByRole('tab', { name: path.startsWith('/matches') ? 'Прошлые' : 'Оплата', exact: true });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('navigation').getByRole('link', { name: 'Создать матч' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator(path.startsWith('/matches') ? '#matches-past' : '#tab-bill')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(path);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
});

test('a late create response cannot pull a person away after browser Back', async ({ page }) => {
  let finish = () => {};
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/events', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    await pending;
    await route.fulfill({ json: { id: 7 } });
  });
  await page.goto('/profile');
  await page.getByRole('navigation').getByRole('link', { name: 'Создать матч' }).click();
  await page.getByRole('dialog').getByLabel('Дата', { exact: true }).fill('2026-11-08');
  await page.getByRole('dialog').getByRole('button', { name: 'Создать матч' }).click();
  await expect(page.getByRole('button', { name: 'Создаём матч…' })).toBeDisabled();
  await page.goBack();
  await expect(page).toHaveURL('/profile');
  await page.getByRole('navigation').getByRole('link', { name: 'Главная' }).click();
  await expect(page).toHaveURL('/');
  const response = page.waitForResponse(r => r.url().endsWith('/api/events') && r.request().method() === 'POST');
  finish();
  await (await response).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Ближайший матч', exact: true })).toBeVisible();
});

test('appointment is the prerequisite for billing; assigning time unlocks the bill form', async ({ page }) => {
  let scheduled = false;
  let started = false;
  await page.route('**/api/events/7', route => route.fulfill({ json: scheduled ? { ...draft, status: started ? 'playing' : 'scheduled', startTime: '20:00', durationHours: 2, limit: 15, place: 'Школа Аксай' } : draft }));
  await page.route('**/api/events/7/schedule', route => {
    expect(route.request().postDataJSON()).toEqual({ startTime: '20:00', durationHours: 2, place: 'Школа Аксай' });
    scheduled = true;
    return route.fulfill({ json: { kind: 'ok' } });
  });
  await page.goto('/event/7?tab=bill');
  await expect(page.getByRole('button', { name: 'Выставить счёт' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Назначить игру' }).click();
  await page.getByLabel('Начало').fill('20:00');
  await page.getByRole('button', { name: /2 часа/ }).click();
  await page.getByRole('button', { name: /Место проведения/ }).click();
  await page.getByRole('button', { name: 'Выбрать площадку', exact: true }).click();
  await page.getByRole('button', { name: 'Назначить игру', exact: true }).click();
  await expect(page).toHaveURL('/event/7?tab=bill');
  await expect(page.getByText('20:00–22:00')).toBeVisible();
  await page.getByRole('tab', { name: 'Оплата', exact: true }).click();
  await expect(page.getByText('Счёт будет доступен после начала игры')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выставить счёт' })).toHaveCount(0);
  started = true;
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await page.getByRole('button', { name: 'Выставить счёт' }).click();
  const billSheet = page.getByRole('dialog', { name: 'Выставить счёт' });
  await expect(billSheet.getByRole('button', { name: 'Выставить счёт' })).toBeDisabled();
  await page.getByLabel('Аренда поля, ₸').fill('20000');
  await expect(billSheet.getByRole('button', { name: 'Выставить счёт' })).toBeEnabled();
  await page.getByRole('button', { name: '+ Расход' }).click();
  await expect(billSheet.getByRole('button', { name: 'Выставить счёт' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Расход 1', exact: true }).fill('Вода');
  await page.getByRole('spinbutton', { name: 'Сумма расхода 1' }).fill('1500');
  await expect(billSheet.getByRole('button', { name: 'Выставить счёт' })).toBeEnabled();
});

for (const width of [320, 390]) {
  test(`loading placeholders fill content at ${width}px across screens`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    // Hold response bodies: check geometry while actual resources are unresolved.
    let release = () => {};
    for (const path of ['/', '/matches', '/matches?view=past', '/notifications', '/event/7', '/event/7/schedule', '/players']) {
      let unblock: () => void = () => {};
      const pending = new Promise<void>(resolve => { unblock = resolve; });
      release = unblock;
      await teamApiRoute(page, async route => {
        if (new URL(route.request().url()).pathname === '/api/me') return route.fallback();
        await pending;
        await route.fallback();
      });
      await page.goto(path);
      await expect(page.getByRole('button', { name: 'Сменить команду' })).toBeVisible();
      const loading = page.locator('main .loading').first();
      await expect(loading).toBeVisible();
      const sizes = await loading.evaluate(el => {
        const screen = el.closest('main')!;
        const box = screen.getBoundingClientRect();
        const css = getComputedStyle(screen);
        return { width: el.getBoundingClientRect().width, available: box.width - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight), mainHeight: box.bottom, skeletonWidths: [...el.querySelectorAll('.skeleton')].map(s => s.getBoundingClientRect().width) };
      });
      expect(Math.abs(sizes.width - sizes.available)).toBeLessThan(1);
      expect(sizes.skeletonWidths.every(value => Math.abs(value - sizes.width) < 1)).toBe(true);
      expect(sizes.mainHeight).toBeGreaterThanOrEqual(843);
      if (path === '/' && width === 390) await page.screenshot({ path: 'artifacts/ui/ux-loading-390.png', fullPage: true });
      release();
      await expect(page.locator('main .loading')).toHaveCount(0);
      await page.unroute('**/api/**');
      // Reinstall fixtures removed with the temporary delay route.
      await teamApiRoute(page, route => {
        const resource = new URL(route.request().url()).pathname;
        return route.fulfill({ json: resource === '/api/me' ? identity : resource === '/api/events' ? { active: [draft], past: [] } : resource === '/api/matches' ? { events: [], nextCursor: null } : resource === '/api/notifications' ? { tasks: [] } : (resource === '/api/members' || resource === '/api/players') ? [] : draft });
      });
    }
  });
}

test('initial authentication skeleton fills width and viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/me', async route => { await pending; await route.fulfill({ json: identity }); });
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Загрузка…' })).toBeVisible();
  expect(await page.locator('main').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(844);
  await page.screenshot({ path: 'artifacts/ui/ux-auth-loading-390.png', fullPage: true });
  release();
  await expect(page.getByRole('heading', { name: 'Ближайший матч', exact: true })).toBeVisible();
});
