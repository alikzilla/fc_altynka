import { teamApiRoute } from './team-fixture';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const me = { userId: 1, displayName: 'Игрок', kaspiPhone: null, communities: [{ id: 1, title: 'Команда', role: 'player' }] };

for (const [width, theme] of [[320, 'dark'], [390, 'light']] as const) test(`lost connection shows one notice and recovers at ${width}px ${theme}`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 700 });
  let down = false;
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await teamApiRoute(page, route => {
    if (down) return route.abort('internetdisconnected');
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/me' ? { ...me, theme } : path === '/api/events' ? { active: [], past: [] } : path === '/api/notifications' ? { tasks: [] } : path === '/api/matches' ? { events: [], nextCursor: null } : {} });
  });
  await page.goto('/matches');
  await expect(page.getByRole('heading', { name: 'Матчи', exact: true })).toBeVisible();
  await expect(page.getByText('Нет связи')).toHaveCount(0);

  down = true;
  await context.setOffline(true);
  const notice = page.locator('.connection-notice');
  await expect(notice).toContainText('Нет связи');
  await expect(notice).toContainText('Обновим, когда сеть вернётся');
  const box = (await notice.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(15);
  expect(box.x + box.width).toBeLessThanOrEqual(width - 15);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The screen steps down: the notice covers neither the title nor anything above it.
  await expect.poll(async () => (await page.getByRole('heading', { name: 'Матчи', exact: true }).boundingBox())!.y).toBeGreaterThanOrEqual(box.y + box.height + 8);
  // The hint stays on one line even on a 320 px phone.
  expect(await notice.locator('small').evaluate(el => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))).toBeLessThan(1.5);
  expect((await new AxeBuilder({ page }).include('.connection-notice').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  down = false;
  await context.setOffline(false);
  await expect(notice).toContainText('Снова на связи');
  await expect(page.locator('.connection-notice')).toHaveCount(0, { timeout: 4000 });
});

test('a server that stops answering while the phone says online raises the notice, and the next answer clears it', async ({ page }) => {
  let down = false;
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await teamApiRoute(page, route => {
    if (down) return route.abort('connectionfailed');
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/me' ? me : path === '/api/events' ? { active: [], past: [] } : path === '/api/notifications' ? { tasks: [] } : path === '/api/matches' ? { events: [], nextCursor: null } : {} });
  });
  await page.goto('/matches');
  await expect(page.getByRole('heading', { name: 'Матчи', exact: true })).toBeVisible();
  down = true;
  // The phone still reports a connection; the first unanswered request is what raises the notice.
  await page.getByRole('tab', { name: /Прошлые|Прошедшие/ }).click();
  await expect(page.locator('.connection-notice')).toContainText('Нет связи');
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  down = false;
  // The notice retries on its own; «online» stands in for the ten-second timer.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.connection-notice')).toContainText('Снова на связи');
});
