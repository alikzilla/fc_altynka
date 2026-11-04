import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [280, 390]) for (const role of ['player', 'organizer']) test(`profile card keeps photo left, football row below, and direct settings: ${role} ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const name = width === 280 ? 'Александр Константинопольский' : 'Тимур Нурланов';
  const username = width === 280 ? 'very_long_football_player_username' : 'timur';
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', r => r.fulfill({ json: new URL(r.request().url()).pathname === '/api/me'
    ? { userId: 2, displayName: name, role, kaspiPhone: null, profileCompleted: true, playingPosition: 'midfielder', dominantFoot: 'both', telegram: { firstName: name, lastName: null, username, photoUrl: null } }
    : { tasks: [] } }));
  await page.goto('/profile');
  const card = page.getByRole('region', { name: 'Профиль игрока' });
  await expect(card.getByText(name, { exact: true })).toBeVisible();
  await expect(card.getByText(`@${username}`)).toBeVisible();
  await expect(card.getByText('Полузащитник', { exact: true })).toBeVisible();
  await expect(card.getByText('Обе', { exact: true })).toBeVisible();
  const avatar = (await card.locator('.avatar').boundingBox())!;
  const heading = (await card.getByRole('heading').boundingBox())!;
  expect(avatar.x + avatar.width).toBeLessThanOrEqual(heading.x);
  const football = await card.locator('.profile-card-football').boundingBox();
  expect(football!.y).toBeGreaterThanOrEqual(Math.max(avatar.y + avatar.height, heading.y + heading.height));
  const cells = await card.locator('.profile-card-football > div').all();
  expect(Math.abs((await cells[0].boundingBox())!.y - (await cells[1].boundingBox())!.y)).toBeLessThan(1);
  const editing = page.getByRole('navigation', { name: 'Настройка профиля', exact: true });
  await expect(editing.getByRole('link')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Управление', exact: true })).toHaveCount(role === 'organizer' ? 1 : 0);
  await expect(page.getByRole('link', { name: /Игроки команды/ })).toHaveCount(role === 'organizer' ? 1 : 0);
  await expect(page.getByRole('switch')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `artifacts/ui/profile-card-${role}-${width}.png`, fullPage: true });
  await editing.getByRole('link', { name: /Изменить оплату/ }).click();
  await expect(page).toHaveURL('/profile/settings/payment');
  await expect(page.getByLabel('Номер Kaspi')).toBeVisible();
});

for (const width of [280, 320, 390]) test(`profile setup stays saved and football/payment settings fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  let me = { userId: 2, displayName: 'Тимур', role: 'player', kaspiPhone: null as string | null, profileCompleted: false, playingPosition: null as string | null, dominantFoot: null as string | null, notifications: { enabled: false, available: true } };
  const payloads: Record<string, unknown>[] = [];
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', r => {
    if (new URL(r.request().url()).pathname === '/api/me') {
      if (r.request().method() === 'PATCH') {
        const payload = r.request().postDataJSON(); payloads.push(payload);
        if (payload.kaspiPhone === '+77070000000') return r.fulfill({ status: 409, json: { error: 'receiver_needs_phone' } });
        me = { ...me, ...payload };
      }
      return r.fulfill({ json: me });
    }
    return r.fulfill({ json: { tasks: [] } });
  });
  const fits = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  };
  await page.goto('/profile');
  await page.getByLabel('Номер Kaspi').fill('8 707 123 45 67');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByLabel('Номер Kaspi')).toHaveCount(0);
  expect(payloads[0]).toMatchObject({ profileCompleted: true, kaspiPhone: '+77071234567' });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Профиль игрока' })).toBeVisible();
  await expect(page.getByLabel('Номер Kaspi')).toHaveCount(0);
  await fits();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Профиль', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: /Изменить футбольные данные/ }).click();
  await page.getByLabel('Позиция на поле').selectOption('goalkeeper');
  await page.getByLabel('Рабочая нога').selectOption('left');
  await fits();
  await page.screenshot({ path: `artifacts/ui/profile-football-settings-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.goto('/profile');
  await expect(page.getByText('Вратарь', { exact: true })).toBeVisible();
  await expect(page.getByText('Левая', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Номер Kaspi')).toHaveCount(0);
  await page.screenshot({ path: `artifacts/ui/profile-saved-${width}.png`, fullPage: true });
  await page.getByRole('link', { name: /Изменить оплату/ }).click();
  await expect(page.getByLabel('Номер Kaspi')).toHaveValue('+7 707 123 45 67');
  await page.getByLabel('Номер Kaspi').fill('');
  await fits();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.goto('/profile');
  await expect(page.getByRole('region', { name: 'Профиль игрока' })).toBeVisible();
  await expect(page.getByLabel('Номер Kaspi')).toHaveCount(0);
  expect(me).toMatchObject({ profileCompleted: true, kaspiPhone: null, playingPosition: 'goalkeeper', dominantFoot: 'left' });
});

test('profile destination remains current while editing settings', async ({ page }) => {
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', r => r.fulfill({ json: new URL(r.request().url()).pathname === '/api/me'
    ? { userId: 1, displayName: 'Тимур', role: 'player', kaspiPhone: null, profileCompleted: true }
    : { tasks: [] } }));
  await page.goto('/profile/settings/football');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Профиль', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL('/profile');
  await expect(page.getByRole('navigation', { name: 'Настройка профиля' }).getByRole('link')).toHaveCount(3);
  await page.goto('/profile/settings');
  await expect(page).toHaveURL('/profile');
});

for (const width of [320, 390]) test(`system switches apply and persist light theme at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  let me = { userId: 2, displayName: 'Тимур', role: 'player', kaspiPhone: null, profileCompleted: true, theme: 'dark', notifications: { enabled: false, available: true } };
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', r => {
    if (new URL(r.request().url()).pathname !== '/api/me') return r.fulfill({ json: { tasks: [] } });
    if (r.request().method() === 'PATCH') {
      const body = r.request().postDataJSON();
      me = { ...me, ...(body.theme ? { theme: body.theme } : {}), notifications: { ...me.notifications, ...(body.notificationsEnabled !== undefined ? { enabled: body.notificationsEnabled } : {}) } };
    }
    return r.fulfill({ json: me });
  });
  await page.goto('/profile');
  await page.getByRole('switch', { name: 'Тёмная тема' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('switch', { name: 'Тёмная тема' })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Уведомления' })).toBeEnabled();
  await page.getByRole('switch', { name: 'Уведомления' }).click();
  await expect(page.getByRole('switch', { name: 'Уведомления' })).toBeChecked();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Профиль игрока' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(244, 242, 247)');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/ui/profile-system-light-${width}.png`, fullPage: true });
  await page.getByRole('link', { name: /Изменить футбольные данные/ }).click();
  const select = page.getByLabel('Позиция на поле');
  expect(await select.evaluate(el => getComputedStyle(el).backgroundRepeat)).toBe('no-repeat');
  expect(await select.evaluate(el => getComputedStyle(el).backgroundSize)).toMatch(/^16px(?: auto)?$/);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'Назад', exact: true }).click();
  await expect(page).toHaveURL('/profile');
  await page.getByRole('switch', { name: 'Тёмная тема' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: `artifacts/ui/profile-system-dark-${width}.png`, fullPage: true });
});

test('late notification response does not erase a phone saved concurrently during setup', async ({ page }) => {
  let me = { userId: 2, displayName: 'Тимур', role: 'player', kaspiPhone: null as string | null, profileCompleted: false, theme: 'dark', notifications: { enabled: false, available: true } };
  let releaseNotification!: () => void; const notificationHold = new Promise<void>(r => { releaseNotification = r; });
  let releaseRefresh!: () => void; const refreshHold = new Promise<void>(r => { releaseRefresh = r; });
  let started = false; let saved = false;
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', async r => {
    if (new URL(r.request().url()).pathname !== '/api/me') return r.fulfill({ json: { tasks: [] } });
    if (r.request().method() === 'PATCH') {
      const body = r.request().postDataJSON();
      if (body.notificationsEnabled) {
        me = { ...me, notifications: { enabled: true, available: true } };
        const old = me; started = true;
        await notificationHold;
        return r.fulfill({ json: old });
      }
      me = { ...me, ...body }; saved = true;
    } else if (saved) await refreshHold;
    return r.fulfill({ json: me });
  });
  try {
    await page.goto('/profile');
    await page.getByRole('switch', { name: 'Уведомления' }).click();
    await expect.poll(() => started).toBe(true);
    await page.getByLabel('Номер Kaspi').fill('8 707 123 45 67');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByLabel('Номер Kaspi')).toHaveCount(0);
    releaseNotification();
    await expect(page.getByRole('switch', { name: 'Уведомления' })).toBeChecked();
    await page.getByRole('link', { name: /Изменить оплату/ }).click();
    await expect(page.getByLabel('Номер Kaspi')).toHaveValue('+7 707 123 45 67');
  } finally { releaseNotification(); releaseRefresh(); }
});

test('an obsolete theme failure cannot undo a newer successful choice after navigation', async ({ page }) => {
  let me = { userId: 2, displayName: 'Тимур', role: 'player', kaspiPhone: null, profileCompleted: true, theme: 'dark' };
  let releaseFirst!: () => void; const hold = new Promise<void>(r => { releaseFirst = r; });
  let attempts = 0;
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', async r => {
    if (new URL(r.request().url()).pathname !== '/api/me') return r.fulfill({ json: { tasks: [] } });
    if (r.request().method() === 'PATCH') {
      attempts++;
      if (attempts === 1) { await hold; return r.fulfill({ status: 500, json: { error: 'offline' } }); }
      me = { ...me, ...r.request().postDataJSON() };
    }
    return r.fulfill({ json: me });
  });
  try {
    await page.goto('/profile');
    await page.getByRole('switch', { name: 'Тёмная тема' }).click();
    await expect.poll(() => attempts).toBe(1);
    await page.getByRole('link', { name: /Изменить имя/ }).click();
    await page.getByRole('link', { name: 'Назад', exact: true }).click();
    await page.getByRole('switch', { name: 'Тёмная тема' }).click();
    await expect.poll(() => attempts).toBe(2);
    await expect(page.getByRole('switch', { name: 'Тёмная тема' })).toBeEnabled();
    const failed = page.waitForResponse(r => new URL(r.url()).pathname === '/api/me' && r.status() === 500);
    releaseFirst(); await failed;
    await page.getByRole('link', { name: /Изменить имя/ }).click();
    await page.getByRole('link', { name: 'Назад', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(me.theme).toBe('light');
  } finally { releaseFirst(); }
});

test('opening payment settings immediately after setup uses the saved phone while refresh is delayed', async ({ page }) => {
  let me = { userId: 2, displayName: 'Тимур', role: 'player', kaspiPhone: null as string | null, profileCompleted: false };
  let saved = false;
  let resume!: () => void;
  const holdRefresh = new Promise<void>(resolve => { resume = resolve; });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', async r => {
    if (new URL(r.request().url()).pathname !== '/api/me') return r.fulfill({ json: { tasks: [] } });
    if (r.request().method() === 'PATCH') { me = { ...me, ...r.request().postDataJSON() }; saved = true; }
    else if (saved) await holdRefresh;
    return r.fulfill({ json: me });
  });
  try {
    await page.goto('/profile');
    await page.getByLabel('Номер Kaspi').fill('8 707 123 45 67');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByLabel('Номер Kaspi')).toHaveCount(0);
    await page.getByRole('link', { name: /Изменить оплату/ }).click();
    await expect(page.getByLabel('Номер Kaspi')).toHaveValue('+7 707 123 45 67');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    expect(me.kaspiPhone).toBe('+77071234567');
  } finally { resume(); }
});
