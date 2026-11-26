import { teamApiRoute } from './team-fixture';
import { animationsSettled, test, expect } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { expectStableSheet, sheetHeight } from './sheet-height';

const identity = { userId: 1, displayName: 'Организатор', role: 'organizer', kaspiPhone: '+77071234567' };
const players = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, seq: i + 1, userId: i + 1, name: i === 0 ? 'Организатор' : `Игрок ${i + 1}`, invitedByUserId: null, guestOfName: null }));
const event = { id: 7, date: '2026-11-08', status: 'playing', startTime: '20:00', durationHours: 2, place: 'Arena Football', mainCount: 12, reserveCount: 0, limit: 15, my: 'main', main: players, reserve: [], teams: null, bill: null, comment: null };

for (const width of [320, 390]) {
  test(`bill opens as a bottom sheet, retains its page and restores focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
    await teamApiRoute(page, r => r.fulfill({ json: new URL(r.request().url()).pathname === '/api/me' ? identity : new URL(r.request().url()).pathname === '/api/notifications' ? { tasks: [] } : { ...event, reserveCount: 1, reserve: [{ ...players[1], id: 20, userId: 20, name: 'Резервный игрок' }] } }));
    await page.goto('/event/7?tab=bill');
    const trigger = page.getByRole('button', { name: 'Выставить счёт', exact: true });
    await trigger.click();
    const sheet = page.getByRole('dialog', { name: 'Выставить счёт' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Выставить счёт' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(sheet.getByText('Ещё из резерва', { exact: true })).toBeFocused();
    await sheet.getByRole('heading', { name: 'Выставить счёт' }).focus();
    await expect(page).toHaveURL('/event/7?tab=bill');
    await expect(page.locator('main h1')).toHaveText('8 ноября');
    await expect(page.locator('#tab-bill')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => { const box = (await sheet.boundingBox())!; return Math.round(box.y + box.height); }).toBe(width === 320 ? 568 : 844);
    const submit = sheet.getByRole('button', { name: 'Выставить счёт', exact: true });
    const before = (await submit.boundingBox())!;
    await sheet.locator('.sheet-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
    const after = (await submit.boundingBox())!;
    expect(Math.abs(before.y - after.y)).toBeLessThan(1);
    expect(after.y + after.height).toBeLessThanOrEqual(width === 320 ? 568 : 844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await sheet.locator('.sheet-content').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `artifacts/ui/bill-sheet-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL('/event/7?tab=bill');
  });
}

test('bill sheet preserves a failed draft, locks pending dismissal and closes after success', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let attempts = 0;
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, async r => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/events/7/bill') {
      attempts++;
      if (attempts === 1) return r.fulfill({ status: 503, json: { error: 'offline' } });
      await pending;
      expect(r.request().postDataJSON()).toMatchObject({ fieldAmount: 24000, participantSignupIds: players.map(p => p.id) });
      return r.fulfill({ json: { kind: 'ok' } });
    }
    return r.fulfill({ json: path === '/api/me' ? identity : path === '/api/notifications' ? { tasks: [] } : event });
  });
  try {
    await page.goto('/event/7?tab=bill');
    await page.getByRole('button', { name: 'Выставить счёт', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Выставить счёт' });
    await sheet.getByLabel('Аренда поля, ₸').fill('24000');
    await sheet.getByRole('button', { name: 'Выставить счёт', exact: true }).click();
    await expect(sheet.getByRole('alert')).toContainText('Не получилось выставить счёт');
    await expect(sheet.getByLabel('Аренда поля, ₸')).toHaveValue('24000');
    await sheet.getByRole('button', { name: 'Выставить счёт', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Отправляем счёт…' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Закрыть', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeVisible();
    expect(attempts).toBe(2);
    release();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL('/event/7?tab=bill');
    await expect(page.locator('#tab-bill')).toHaveAttribute('aria-selected', 'true');
  } finally { release(); }
});

for (const width of [320, 390]) test(`bill sheet keeps its height through the share, an extra, a Kaspi error and another receiver at ${width}px`, async ({ page }) => {
  // Tall enough that the sheet is not capped: a growth would show.
  await page.setViewportSize({ width, height: 1400 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const few = players.slice(0, 4).map((p, i) => i === 1 ? { ...p, kaspiPhone: '+77011111111' } : p);
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/events/7/bill') return r.fulfill({ status: 400, json: { error: 'no_kaspi' } });
    return r.fulfill({ json: path === '/api/me' ? { ...identity, kaspiPhone: null } : path === '/api/notifications' ? { tasks: [] } : { ...event, mainCount: 4, main: few } });
  });
  await page.goto('/event/7?tab=bill');
  await page.getByRole('button', { name: 'Выставить счёт', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Выставить счёт' });
  await expect(sheet.getByText('Укажи аренду — здесь появится сумма с человека')).toBeVisible();
  expect(await sheetHeight(page, sheet)).toBeLessThan(1400 - 40);
  await expectStableSheet(page, sheet, async () => {
    await sheet.getByLabel('Аренда поля, ₸').fill('24000');
    await expect(sheet.getByText(/По 6\s000\s₸ с человека/)).toBeVisible();
  });
  // The first extra takes its outline's box. The sheet may still grow here: an empty extra brings the
  // «укажи название и сумму» check, which the audit leaves unreserved (decision 5).
  // Measured from the sheet's top: a sheet that grows rises from the bottom edge.
  const top = async () => (await sheet.boundingBox())!.y;
  const outline = (await sheet.locator('.extra-placeholder').boundingBox())!;
  const outlineOffset = outline.y - await top();
  await sheet.getByRole('button', { name: '+ Расход' }).click();
  const row = (await sheet.getByRole('textbox', { name: 'Расход 1', exact: true }).locator('xpath=..').boundingBox())!;
  await animationsSettled(page);
  expect(Math.abs(row.y - await top() - outlineOffset)).toBeLessThanOrEqual(1);
  // The two-line hint makes the outline a little taller than the 48px row: never shorter.
  expect(row.height).toBeLessThanOrEqual(outline.height + 1);
  await sheet.getByRole('button', { name: 'Убрать расход 1' }).click();
  await expectStableSheet(page, sheet, async () => {
    await sheet.getByRole('button', { name: 'Выставить счёт', exact: true }).click();
    await expect(sheet.getByText('Нужен номер Kaspi получателя', { exact: true })).toBeVisible();
  });
  await expectStableSheet(page, sheet, async () => {
    await sheet.getByLabel('Кто заплатил за поле').selectOption(String(few[1].userId));
    await expect(sheet.getByText('Номер получатель меняет в своём профиле')).toBeVisible();
  });
  await expect(sheet.getByLabel('Номер Kaspi получателя')).toHaveValue('+7 701 111 11 11');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});
