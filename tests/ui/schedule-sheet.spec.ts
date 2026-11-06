import { teamApiRoute } from './team-fixture';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const draft = { id: 7, date: '2026-11-08', serverNow: Date.parse('2026-11-06T08:00:00Z'), status: 'collecting', startTime: null, durationHours: null, place: null, limit: 10, mainCount: 0, reserveCount: 0, my: null, main: [], reserve: [], teams: null, bill: null, comment: null };
async function setup(page: Page, theme = 'dark') {
  const submissions: unknown[] = [];
  let value: Record<string, unknown> = { ...draft };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(`window.Telegram={WebApp:{initData:'',initDataUnsafe:{},ready(){},expand(){},openLink(url){window.mapUrls=(window.mapUrls||[]).concat(url)},BackButton:{show(){},hide(){},onClick(cb){window.testBack=cb},offClick(cb){if(window.testBack===cb)window.testBack=null}}}}`);
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/me') return r.fulfill({ json: { userId: 1, displayName: 'Организатор', role: 'organizer', profileCompleted: true, theme } });
    if (path === '/api/notifications') return r.fulfill({ json: { tasks: [] } });
    if (path === '/api/events/7/schedule') { const data = r.request().postDataJSON(); submissions.push(data); value = { ...value, ...data, status: 'scheduled' }; return r.fulfill({ json: { kind: 'ok' } }); }
    return r.fulfill({ json: path === '/api/events' ? { active: [value], past: [] } : value });
  });
  return submissions;
}

for (const theme of ['dark', 'light']) for (const width of [320, 390]) {
  test(`appointment and Aksay picker preserve the match and draft at ${width}px in ${theme}`, async ({ page }, info) => {
    const height = width === 320 ? 568 : 844;
    await page.setViewportSize({ width, height });
    const submissions = await setup(page, theme);
    await page.goto('/event/7?tab=bill');
    await page.getByRole('link', { name: 'Назначить игру' }).click();
    const sheet = page.getByRole('dialog', { name: 'Назначить игру', exact: true });
    await expect(sheet.getByLabel('Начало')).toBeVisible();
    await expect(page.locator('main h1')).toHaveText('8 ноября');
    await expect(page.locator('#tab-bill')).toHaveAttribute('aria-selected', 'true');
    await sheet.getByLabel('Начало').fill('22:30');
    await sheet.getByRole('button', { name: /2 часа/ }).click();
    const venueTrigger = sheet.getByRole('button', { name: /Место проведения/ });
    await venueTrigger.click();
    const picker = page.getByRole('dialog', { name: 'Место проведения', exact: true });
    await expect(picker).toBeVisible();
    await expect(picker.locator('.venue-option')).toHaveCount(1);
    await expect(picker.getByRole('button', { name: /Школа Аксай/ })).toHaveAttribute('aria-pressed', 'true');
    const map = picker.getByRole('link', { name: 'Открыть в 2ГИС' });
    await expect(map).toHaveAttribute('href', 'https://go.2gis.com/G47G5');
    await map.click();
    expect(await page.evaluate(() => (window as unknown as { mapUrls: string[] }).mapUrls)).toEqual(['https://go.2gis.com/G47G5']);
    await page.evaluate(() => dispatchEvent(new Event('focus')));
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await picker.getByRole('heading').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(picker.getByRole('button', { name: 'Выбрать площадку', exact: true })).toBeFocused();
    await picker.getByRole('heading').focus();
    await page.screenshot({ path: `artifacts/ui/${info.project.name}-venue-${theme}-${width}.png` });
    await page.evaluate(() => (window as unknown as { testBack: () => void }).testBack());
    await expect(picker).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await expect(venueTrigger).toBeFocused();
    await expect(venueTrigger).toContainText('Выбрать площадку');
    await venueTrigger.click();
    await picker.getByRole('button', { name: 'Выбрать площадку', exact: true }).click();
    await expect(picker).toHaveCount(0);
    await expect(sheet.getByLabel('Начало')).toHaveValue('22:30');
    await expect(sheet.getByRole('button', { name: /2 часа/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(venueTrigger).toContainText('Школа Аксай');
    const submit = sheet.getByRole('button', { name: 'Назначить игру', exact: true });
    const before = (await submit.boundingBox())!;
    await sheet.locator('.sheet-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
    const after = (await submit.boundingBox())!;
    expect(Math.abs(before.y - after.y)).toBeLessThan(1);
    expect(after.y + after.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `artifacts/ui/${info.project.name}-schedule-${theme}-${width}.png` });
    await submit.click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL('/event/7?tab=bill');
    expect(submissions).toEqual([{ startTime: '22:30', durationHours: 2, place: 'Школа Аксай' }]);
    await expect(page.locator('.match-detail-place')).toContainText('Школа Аксай');
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });
}

test('Escape closes only the top sheet; browser Back with two sheets restores scrolling', async ({ page }) => {
  await setup(page);
  await page.goto('/event/7');
  await page.getByRole('link', { name: 'Назначить игру' }).click();
  const sheet = page.getByRole('dialog', { name: 'Назначить игру', exact: true });
  const trigger = sheet.getByRole('button', { name: /Место проведения/ });
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Место проведения', exact: true })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.goBack();
  await expect(page).toHaveURL('/event/7');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('editing from the match menu replaces it, and closing both sheets restores the match tab', async ({ page }) => {
  await setup(page);
  await page.route('**/api/events/7', r => r.fulfill({ json: { ...draft, status: 'scheduled', startTime: '21:00', durationHours: 1 } }));
  await page.goto('/event/7?tab=teams');
  await page.getByRole('button', { name: 'Действия матча' }).click();
  await page.getByRole('link', { name: 'Изменить время и поле' }).click();
  const sheet = page.getByRole('dialog', { name: 'Изменить время и поле', exact: true });
  await expect(sheet.getByLabel('Начало')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await sheet.getByRole('button', { name: /Место проведения/ }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await sheet.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL('/event/7?tab=teams');
  await expect(page.getByRole('tab', { name: 'Составы' })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
