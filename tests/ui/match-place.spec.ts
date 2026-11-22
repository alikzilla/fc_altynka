import { teamApiRoute } from './team-fixture';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const me = { userId: 2, displayName: 'Игрок', kaspiPhone: null, communities: [{ id: 1, title: 'Команда', role: 'player' }] };
const ev = { id: 7, community: { id: 1, title: 'Команда' }, viewerRole: 'player', date: '2026-11-25', status: 'scheduled', startTime: '20:00', durationHours: 2, place: 'Манеж Арена на Толе би', placeMapUrl: 'https://go.2gis.com/abc', comment: null, limit: 10, mainCount: 0, reserveCount: 0, my: null, main: [], reserve: [], teams: null, bill: null };

for (const [width, theme] of [[320, 'dark'], [390, 'light']] as const) test(`tapping the place copies its 2GIS link at ${width}px ${theme}`, async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width, height: 640 });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/me' ? { ...me, theme } : path === '/api/notifications' ? { tasks: [] } : ev });
  });
  await page.goto('/event/7');
  const place = page.getByRole('button', { name: 'Манеж Арена на Толе би, скопировать ссылку на 2ГИС' });
  await expect(place).toBeVisible();
  // The hit area reaches 44 px without changing the card's layout.
  expect(await place.evaluate(el => { const r = el.getBoundingClientRect(), a = getComputedStyle(el, '::after'); return r.height - parseFloat(a.top) - parseFloat(a.bottom); })).toBeGreaterThanOrEqual(42);
  expect((await new AxeBuilder({ page }).include('.event-summary').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await place.click();
  await expect(page.getByText('Ссылка на 2ГИС скопирована')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://go.2gis.com/abc');
});
