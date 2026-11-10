import { teamApiRoute } from './team-fixture';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Synthetic data: tests never connect to the bot, D1, or a real group.
const community = { id: 1, title: 'Футбол по субботам' };
const event = { community, viewerRole: 'player', id: 1, date: '2026-11-14', status: 'scheduled', startTime: '21:00', durationHours: 1, place: 'Школа Аксай', limit: 10, mainCount: 8, reserveCount: 0, my: 'main', comment: null, main: [], reserve: [], teams: null, bill: null };
const at = (iso: string) => Date.parse(iso);
const post = (id: number, kind: string, text: string, patch: object = {}) => ({ id, kind, text, highlights: [], createdAt: at('2026-11-07T17:00:00Z'), eventId: 2, eventDate: '2026-11-07', community, userId: null, teamColor: null, ...patch });
const posts = [
  post(1, 'scheduled', 'Матч 14 ноября начнётся в 21:00, Школа Аксай.', { eventId: 1, eventDate: '2026-11-14', createdAt: at('2026-11-09T06:00:00Z') }),
  post(2, 'winner', 'Красные не оставили шансов: 4 победы из 4.', { highlights: ['Красные'], teamColor: 'red' }),
  post(3, 'hero', 'Айкын — герой матча: 2 гола и 2 передачи.', { highlights: ['Айкын'], userId: 12 }),
  post(4, 'hat_trick', 'Данияр оформляет хет-трик. Вратари просят больше так не делать.', { highlights: ['Данияр'], userId: 13 }),
  post(5, 'duo', 'Связка матча: Ерлан отдаёт, Тимур забивает. И так 3 раза.', { highlights: ['Ерлан', 'Тимур'] }),
  post(6, 'achievement', 'Айкын берёт новую высоту: «Бомбардир», золото. Уже 50 голов.', { highlights: ['Айкын'], userId: 12 }),
  post(7, 'summary', 'Матч в цифрах: 9 игр, 21 гол.'),
];

for (const theme of ['dark', 'light'] as const) {
  test(`home feed in the ${theme} theme`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-09T09:00:00Z'));
    await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
    await teamApiRoute(page, async route => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({ json: path === '/api/me' ? { userId: 1, displayName: 'Алихан', kaspiPhone: null, theme, communities: [{ ...community, role: 'player' }] }
        : path === '/api/events' ? { active: [event], past: [] } : path === '/api/notifications' ? { tasks: [] } : path === '/api/feed' ? { posts } : event });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const feed = page.locator('section', { has: page.getByRole('heading', { name: 'Лента' }) });
    await expect(feed.getByRole('link')).toHaveCount(5);
    await expect(feed.getByRole('link', { name: /Красные не оставили шансов/ })).toHaveAttribute('href', '/event/2?tab=games');
    await expect(feed.getByRole('link', { name: /герой матча/ })).toHaveAttribute('href', '/players/12');
    await expect(feed.getByText('Сегодня')).toBeVisible();
    await feed.getByRole('button', { name: 'Показать ещё' }).click();
    await expect(feed.getByRole('link')).toHaveCount(7);
    // The last post scrolls clear of the dock.
    await feed.getByRole('link').last().scrollIntoViewIfNeeded();
    const last = await feed.getByRole('link').last().boundingBox();
    const dock = await page.locator('.nav').boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(dock!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `artifacts/ui/feed-${theme}.png`, fullPage: true });
  });
}
