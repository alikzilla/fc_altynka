import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const dates = Array.from({ length: 7 }, (_, i) => day(i));
const me = (role: 'player' | 'organizer') => ({ userId: 2, displayName: 'Тимур', kaspiPhone: null, profileCompleted: true, theme: 'dark', communities: [{ id: 1, title: 'FC Altynka', role }] });

async function mock(page: Page, role: 'player' | 'organizer') {
  const calendar = { weekly: [null, null, null, null, null, { status: 'yes', parts: [] }, null] as unknown[], days: dates.map((date, i) => ({ date, mark: i === 2 ? { status: 'no', parts: [] } : i === 4 ? { status: 'yes', parts: ['evening'] } : null, override: i === 2 || i === 4 })) };
  const writes: { path: string; body: unknown }[] = [];
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      writes.push({ path: url.pathname, body });
      const date = url.pathname.split('/').pop()!;
      if (url.pathname.endsWith('/weekly')) calendar.weekly = body.weekly;
      else calendar.days = calendar.days.map(d => d.date === date ? { date, mark: body.mark, override: !!body.mark } : d);
      return route.fulfill({ json: calendar });
    }
    if (url.pathname === '/api/me') return route.fulfill({ json: me(role) });
    if (url.pathname === '/api/availability') return route.fulfill({ json: calendar });
    if (url.pathname === '/api/availability/summary') return route.fulfill({ json: { community: { id: 1, title: 'FC Altynka' }, days: dates.map((date, i) => ({
      date, unknown: 6,
      yes: i === 3 ? ['Тимур', 'Ерлан', 'Данияр', 'Азамат', 'Нурлан', 'Санжар', 'Алихан', 'Бауыржан', 'Константин'].map((name, n) => ({ userId: 10 + n, name, parts: n === 0 ? ['evening'] : [] })) : i === 1 ? [{ userId: 10, name: 'Тимур', parts: [] }] : [],
      no: i === 3 ? [{ userId: 30, name: 'Руслан', parts: [] }] : [],
    })) } });
    if (url.pathname === '/api/events') return route.fulfill({ json: { active: [], past: [] } });
    if (url.pathname === '/api/notifications') return route.fulfill({ json: { tasks: [] } });
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
  return writes;
}

for (const width of [280, 390]) test(`availability sheet over the profile: mark a day and the weekly pattern, ${width}px`, async ({ page }) => {
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
  await page.getByRole('region').filter({ has: page.getByRole('button', { name: 'Как обычно' }) }).getByRole('button', { name: 'Не могу', exact: true }).click();
  await expect(grid.getByRole('button', { name: /— не могу$/ })).toHaveCount(2);
  expect(writes.at(-1)).toEqual({ path: `/api/availability/days/${dates[1]}`, body: { mark: { status: 'no', parts: [] } } });

  await page.getByRole('group', { name: 'Обычный график' }).getByRole('button', { name: /^Вторник/ }).click();
  const weekday = page.getByRole('region', { name: 'Вторник' });
  await weekday.getByRole('button', { name: 'Могу', exact: true }).click();
  await weekday.getByRole('button', { name: 'Вечер' }).click();
  await expect.poll(() => writes.at(-1)?.body).toEqual({ weekly: [null, { status: 'yes', parts: ['evening'] }, null, null, null, { status: 'yes', parts: [] }, null] });
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
  const summary = page.getByRole('region', { name: 'Кто может играть' });
  await expect(summary.getByRole('button')).toHaveCount(7);
  await summary.getByRole('button', { name: /— могут 9$/ }).click();
  await expect(page.getByLabel('Дата')).toHaveValue(dates[3]);
  await expect(summary.getByText(/Тимур \(вечер\), Ерлан/)).toBeVisible();
  await expect(summary.getByText(/Руслан/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `artifacts/ui/availability-new-match-${width}.png` });
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
