import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const saturday = { id: 1, title: 'Футбол по субботам' };
const work = { id: 2, title: 'Друзья с работы' };
const names = ['Алихан', 'Дамир', 'Ернар', 'Тимур', 'Санжар', 'Константинопольский-Задунайский'];
const row = (i: number, over: object) => ({ userId: i + 1, displayName: names[i], photoUrl: null, rating: 5 + i * .4, meetings: 3 + i, games: 20 + i, goals: 0, assists: 0, assistsTracked: true, wins: 5, ...over });
const statistics = { groups: [
  { community: saturday, players: [row(0, { goals: 31, assists: 18 }), row(1, { goals: 38, assists: 11 }), row(2, { goals: 22, assists: 25 }), row(4, { goals: 12, assists: 14 }), row(5, { goals: 9, assistsTracked: false })] },
  { community: work, players: [row(0, { goals: 9, assists: 4 }), row(2, { goals: 6, assists: 9 }), row(3, { goals: 17, assists: 5 })] },
] };

async function mockApi(page: Page, role: 'organizer' | 'player', theme = 'dark') {
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', r => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/me') return r.fulfill({ json: { userId: 1, displayName: 'Алихан', profileCompleted: true, kaspiPhone: null, communities: [{ ...saturday, role }, { ...work, role: 'player' }], notifications: { enabled: false, available: true }, theme } });
    if (path === '/api/events') return r.fulfill({ json: { active: [], past: [] } });
    if (path === '/api/notifications') return r.fulfill({ json: { tasks: [] } });
    if (path === '/api/statistics') return r.fulfill({ json: statistics });
    return r.fulfill({ json: {} });
  });
}
const axe = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

for (const [width, theme] of [[320, 'dark'], [390, 'light']] as const) test(`menu opens statistics; podium, filters and boards fit ${width}px ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 780 });
  await mockApi(page, 'organizer', theme);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Меню' });
  await trigger.click();
  const menu = page.getByRole('dialog', { name: 'Меню' });
  await expect(menu.getByRole('link')).toHaveText(['Создать матч', 'Статистика', 'Игроки', 'Площадки']);
  // The sheet grows out of the centre button; wait for the opening animation to settle.
  await expect.poll(() => menu.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  await axe(page);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole('link', { name: 'Статистика' }).click();
  await expect(page).toHaveURL('/stats');
  await expect(menu).toHaveCount(0);
  const podium = page.getByRole('list', { name: 'Лидеры: Голы' });
  await expect(podium.getByRole('button')).toHaveText([/1 место.*Алихан.*40/, /2 место.*Дамир.*38/, /3 место.*Ернар.*28/]);
  // Gold stands in the middle and taller than silver and bronze.
  const [gold, silver, bronze] = await Promise.all(['gold', 'silver', 'bronze'].map(async medal => (await podium.locator(`[data-medal=${medal}]`).boundingBox())!));
  expect(silver.x).toBeLessThan(gold.x); expect(gold.x).toBeLessThan(bronze.x);
  expect(gold.height).toBeGreaterThan(silver.height);
  await fits(page); await axe(page);
  await page.getByRole('button', { name: work.title }).click();
  await page.getByRole('button', { name: 'Пасы' }).click();
  await expect(page.getByRole('list', { name: 'Лидеры: Пасы' }).getByRole('button')).toHaveText([/Ернар.*9/, /Тимур.*5/, /Алихан.*4/]);
  await page.getByRole('button', { name: saturday.title }).click();
  await expect(page.getByRole('list', { name: 'Таблица: Пасы' }).getByRole('button').last()).toHaveText(/Константинопольский.*—/);
  await fits(page);
  // All content scrolls clear of the dock.
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  const note = (await page.locator('.stat-note').boundingBox())!;
  const dock = (await page.getByRole('navigation', { name: 'Основная навигация' }).boundingBox())!;
  expect(note.y + note.height).toBeLessThanOrEqual(dock.y);
});

test('a player sees the same centre button and a menu without match creation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await mockApi(page, 'player');
  await page.goto('/matches');
  await page.getByRole('button', { name: 'Меню' }).click();
  await expect(page.getByRole('dialog', { name: 'Меню' }).getByRole('link')).toHaveText(['Статистика', 'Игроки', 'Площадки']);
});

test('focus rings appear for keyboard navigation only, never after a tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await mockApi(page, 'organizer');
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Меню' });
  const outline = (name: string) => page.getByRole('dialog', { name: 'Меню' }).getByRole('link', { name }).evaluate(node => getComputedStyle(node).outlineStyle);
  await trigger.click();
  // The menu focuses its first icon when it opens; after a tap that must not draw a border.
  const menu = page.getByRole('dialog', { name: 'Меню' });
  await expect(menu.getByRole('link', { name: 'Создать матч' })).toBeFocused();
  expect(await outline('Создать матч')).toBe('none');
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('link', { name: 'Статистика' })).toBeFocused();
  expect(await outline('Статистика')).toBe('solid');
  await page.mouse.click(195, 100);
  await expect(page.getByRole('dialog', { name: 'Меню' })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await trigger.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('none');
});
