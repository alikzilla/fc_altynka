import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const dates = Array.from({ length: 7 }, (_, i) => day(i));
const me = (role: 'player' | 'organizer') => ({ userId: 2, displayName: 'Тимур', kaspiPhone: null, profileCompleted: true, theme: 'dark', communities: [{ id: 1, title: 'FC Altynka', role }] });

async function mock(page: Page, role: 'player' | 'organizer') {
  const calendar = { days: dates.map((date, i) => ({ date, mark: i === 2 ? { status: 'no', parts: [] } : i === 4 ? { status: 'yes', parts: ['evening'] } : null })) };
  const writes: { path: string; body: unknown }[] = [];
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      writes.push({ path: url.pathname, body });
      const date = url.pathname.split('/').pop()!;
      calendar.days = calendar.days.map(d => d.date === date ? { date, mark: body.mark } : d);
      return route.fulfill({ json: calendar });
    }
    if (url.pathname === '/api/me') return route.fulfill({ json: me(role) });
    if (url.pathname === '/api/availability') return route.fulfill({ json: calendar });
    if (url.pathname === '/api/availability/summary') return route.fulfill({ json: { community: { id: 1, title: 'FC Altynka' }, days: dates.map((date, i) => ({
      date, unknown: 6,
      yes: i === 3 ? ['Тимур', 'Ерлан', 'Данияр', 'Азамат', 'Нурлан', 'Санжар', 'Алихан', 'Бауыржан', 'Константин'].map((name, n) => ({ userId: 10 + n, name, parts: n < 2 ? ['evening'] : n < 7 ? ['evening', 'night'] : ['night', 'late'] })) : i === 1 ? [{ userId: 10, name: 'Тимур', parts: ['noon'] }] : [],
      no: i === 3 ? [{ userId: 30, name: 'Руслан', parts: [] }] : [],
    })) } });
    if (url.pathname === '/api/events') return route.fulfill({ json: { active: [], past: [] } });
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { tasks: [] } });
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
  return writes;
}

for (const width of [280, 390]) test(`availability sheet over the profile: mark days and time windows, ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const writes = await mock(page, 'player');
  await page.goto('/profile/availability');
  const sheet = page.getByRole('dialog', { name: 'Когда могу играть' });
  await expect(sheet).toBeVisible();
  const grid = sheet.getByRole('group', { name: 'Ближайшие 7 дней' });
  await expect(grid.getByRole('button')).toHaveCount(7);
  await expect(grid.getByRole('button', { name: /— не могу$/ })).toHaveCount(1);
  for (const cell of await grid.getByRole('button').all()) expect((await cell.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await grid.getByRole('button').nth(1).click();
  const editor = sheet.getByRole('region');
  await editor.getByRole('button', { name: 'Не могу', exact: true }).click();
  await expect(grid.getByRole('button', { name: /— не могу$/ })).toHaveCount(2);
  expect(writes.at(-1)).toEqual({ path: `/api/availability/days/${dates[1]}`, body: { mark: { status: 'no', parts: [] } } });

  await grid.getByRole('button').nth(5).click();
  await editor.getByRole('button', { name: 'Могу', exact: true }).click();
  await expect(editor.getByText('Выбери время, и отметка сохранится.')).toBeVisible();
  const times = editor.getByRole('group', { name: 'Время' });
  await expect(times.getByRole('button')).toHaveCount(7);
  await times.getByRole('button', { name: '18:00–20:00' }).click();
  await times.getByRole('button', { name: 'После 22:00' }).click();
  await expect.poll(() => writes.at(-1)).toEqual({ path: `/api/availability/days/${dates[5]}`, body: { mark: { status: 'yes', parts: ['evening', 'late'] } } });
  await expect(sheet.getByRole('group', { name: 'Обычный график' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `artifacts/ui/availability-${width}.png` });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `artifacts/ui/availability-light-${width}.png` });
  await sheet.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page).toHaveURL('/profile');
  await expect(sheet).toHaveCount(0);
});

for (const width of [280, 390]) test(`new match sheet shows who can play and picks the date, ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await mock(page, 'organizer');
  await page.goto('/new');
  const summary = page.getByRole('region', { name: 'Дата матча' });
  const strip = summary.getByRole('group', { name: 'Дата' });
  await expect(page.locator('input[type=date]')).toHaveCount(0);
  await expect(strip.getByRole('button')).toHaveCount(14);
  // Видна неделя и край восьмого дня; вторая неделя листается.
  const box = (await strip.boundingBox())!;
  const eighth = (await strip.getByRole('button').nth(7).boundingBox())!;
  expect(eighth.x).toBeLessThan(box.x + box.width);
  expect(eighth.x + eighth.width).toBeGreaterThan(box.x + box.width);
  await strip.getByRole('button', { name: /— могут 9$/ }).click();
  await expect(strip.getByRole('button', { name: /— могут 9$/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(summary.getByText('Могут играть · 9 из 16')).toBeVisible();
  const windows = summary.getByRole('list', { name: 'Кто может по времени' }).getByRole('listitem');
  await expect(windows.first()).toBeHidden();
  await page.screenshot({ path: `artifacts/ui/availability-new-match-${width}.png` });
  await summary.getByText('Кто может', { exact: true }).click();
  await expect(windows).toHaveCount(6);
  await expect(windows.nth(3)).toContainText('18:00–20:00');
  await expect(windows.nth(3)).toContainText('7');
  await expect(windows.nth(3)).toContainText('Тимур, Ерлан, Данияр');
  await expect(windows.nth(4)).toContainText('Данияр, Азамат');
  await expect(windows.nth(0)).toContainText('никто');
  await expect(summary.getByText(/Руслан/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `artifacts/ui/availability-new-match-open-${width}.png` });
  const last = strip.getByRole('button').nth(13);
  await last.click();
  await expect(last).toBeInViewport({ ratio: 1 });
  await expect(summary.getByText(/На этот день отметок ещё нет/)).toBeVisible();
});

test('Home reminds to mark the week once and opens the calendar sheet over the profile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, 'player');
  await page.goto('/');
  const prompt = page.getByRole('dialog', { name: 'Когда сможешь играть?' });
  await expect(prompt).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/ui/availability-prompt-390.png' });
  await prompt.getByRole('button', { name: 'Отметить дни' }).click();
  await expect(page).toHaveURL('/profile/availability');
  await expect(page.getByRole('dialog', { name: 'Когда могу играть' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(prompt).toHaveCount(0);
});
