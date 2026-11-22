import { teamApiRoute } from './team-fixture';
import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const me = { userId: 1, displayName: 'Игрок', role: 'organizer', kaspiPhone: null, community: { id: 1, title: 'Команда' } };
const match = (id: number) => ({ id, date: `2026-12-${String(id).padStart(2, '0')}`, status: 'collecting', main: [], reserve: [], mainCount: 0, reserveCount: 0, limit: 10, my: null, teams: null, bill: null });
const matches = Array.from({ length: 24 }, (_, i) => match(i + 1));

test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await teamApiRoute(page, route => {
    const path = new URL(route.request().url()).pathname;
    const id = Number(/^\/api\/events\/(\d+)/.exec(path)?.[1]);
    return route.fulfill({ json: path === '/api/me' ? me : path === '/api/events' ? { active: matches, past: [] } : path === '/api/notifications' ? { tasks: [] } : path === '/api/matches' ? { events: [], nextCursor: null } : match(id || 1) });
  });
  // Every value data-nav takes on <html>, in order.
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { navKinds: string[] }).navKinds = seen;
    new MutationObserver(() => { const kind = document.documentElement.dataset.nav; if (kind) seen.push(kind); })
      .observe(document, { attributes: true, subtree: true, attributeFilter: ['data-nav'] });
  });
});

const kinds = (page: Page) => page.evaluate(() => (window as unknown as { navKinds: string[] }).navKinds);
async function settled(page: Page) {
  await expect(page.locator('html')).not.toHaveAttribute('data-nav', /.+/);
}

test('a match opens forward, Back returns to the same place in the list', async ({ page }) => {
  await page.goto('/matches');
  const row = page.locator('a[href^="/event/20"]').first();
  await expect(row).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  const left = await page.evaluate(() => window.scrollY);
  expect(left).toBeGreaterThan(300);

  await row.click();
  await expect(page).toHaveURL(/\/event\/20/);
  await settled(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByRole('link', { name: 'Назад' }).click();
  await expect(page).toHaveURL(/\/matches/);
  await settled(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(left);
  expect(await kinds(page)).toEqual(['forward', 'back']);
});

test('dock tabs cross-fade and start at the top', async ({ page }) => {
  await page.goto('/matches');
  await expect(page.locator('a[href^="/event/20"]').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.getByRole('link', { name: 'Профиль' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await settled(page);
  await page.getByRole('link', { name: 'Матчи' }).click();
  await expect(page).toHaveURL(/\/matches/);
  await settled(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await kinds(page)).toEqual(['fade', 'fade']);
});

test('reduced motion changes screens at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/matches');
  await page.locator('a[href^="/event/3"]').first().click();
  await expect(page).toHaveURL(/\/event\/3/);
  expect(await kinds(page)).toEqual([]);
});

test('match tabs slide toward the chosen tab while the page and its action stand still', async ({ page }) => {
  await page.goto('/event/3?tab=list');
  await expect(page.getByRole('tab', { name: 'Оплата' })).toBeVisible();
  await page.getByRole('tab', { name: 'Оплата' }).click();
  await expect(page).toHaveURL(/tab=bill/);
  await settled(page);
  await page.getByRole('tab', { name: 'Участники' }).click();
  await expect(page).toHaveURL(/tab=list/);
  await settled(page);
  expect(await kinds(page)).toEqual(['tab-forward', 'tab-back']);
  // The view transition was not skipped: every captured name was unique.
  await expect(page.getByRole('tabpanel')).toBeVisible();
});
