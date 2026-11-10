import { teamApiRoute } from './team-fixture';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Synthetic data: tests never connect to the bot, D1, or a real group.
const community = { id: 1, title: 'Футбол по субботам' };
const event = { community, viewerRole: 'player', id: 1, date: '2026-11-14', status: 'scheduled', startTime: '21:00', durationHours: 1, place: 'Школа Аксай', limit: 10, mainCount: 8, reserveCount: 0, my: 'main', comment: null, main: [], reserve: [], teams: null, bill: null };
const at = (iso: string) => Date.parse(iso);
const post = (id: number, kind: string, text: string, patch: object = {}) => ({ id, kind, text, highlights: [], createdAt: at('2026-11-07T17:00:00Z'), eventId: 2, eventDate: '2026-11-07', community, userId: null, teamColor: null, player: null, reactions: { fire: 0, good: 0, bad: 0 }, myReaction: null, ...patch });
const posts = [
  post(1, 'scheduled', 'Матч 14 ноября начнётся в 21:00, Школа Аксай.', { eventId: 1, eventDate: '2026-11-14', createdAt: at('2026-11-09T06:00:00Z') }),
  post(2, 'winner', 'Красные не оставили шансов: 4 победы из 4.', { highlights: ['Красные'], teamColor: 'red', reactions: { fire: 6, good: 2, bad: 0 }, myReaction: 'fire' }),
  post(3, 'hero', 'Айкын — герой матча: 2 гола и 2 передачи.', { highlights: ['Айкын'], userId: 12, player: { userId: 12, name: 'Айкын', photoUrl: null }, reactions: { fire: 3, good: 4, bad: 1 } }),
  post(4, 'hat_trick', 'Данияр оформляет хет-трик. Вратари просят больше так не делать.', { highlights: ['Данияр'], userId: 13, player: { userId: 13, name: 'Данияр С.', photoUrl: 'https://t.me/i/userpic/320/daniyar.jpg' } }),
  post(5, 'duo', 'Связка матча: Ерлан отдаёт, Тимур забивает. И так 3 раза.', { highlights: ['Ерлан', 'Тимур'] }),
  post(6, 'achievement', 'Айкын берёт новую высоту: «Бомбардир», золото. Уже 50 голов.', { highlights: ['Айкын'], userId: 12, player: { userId: 12, name: 'Айкын', photoUrl: null } }),
  post(7, 'summary', 'Матч в цифрах: 9 игр, 21 гол.'),
];

for (const theme of ['dark', 'light'] as const) {
  test(`home feed in the ${theme} theme`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-09T09:00:00Z'));
    await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
    // A stand-in portrait: the test never loads a real Telegram photo.
    await page.route('https://t.me/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#6d8fb5"/><circle cx="40" cy="30" r="15" fill="#f1d3b8"/><path d="M10 80c0-20 13-30 30-30s30 10 30 30z" fill="#2b3a55"/></svg>' }));
    await teamApiRoute(page, async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'DELETE') return route.fulfill({ json: { ok: true } });
      if (route.request().method() === 'PUT') return route.fulfill({ json: { reactions: { fire: 6, good: 3, bad: 0 }, myReaction: 'good' } });
      await route.fulfill({ json: path === '/api/me' ? { userId: 1, displayName: 'Алихан', kaspiPhone: null, theme, communities: [{ ...community, role: 'admin' }, ...(theme === 'dark' ? [{ id: 2, title: 'Вторая группа', role: 'player' }] : [])] }
        : path === '/api/events' ? { active: [event], past: [] } : path === '/api/notifications' ? { tasks: [] } : path === '/api/feed' ? { posts } : event });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const feed = page.locator('section', { has: page.getByRole('heading', { name: 'Лента' }) });
    await expect(feed.getByRole('link')).toHaveCount(5);
    await expect(feed.getByRole('link', { name: /Красные не оставили шансов/ })).toHaveAttribute('href', '/event/2?tab=games');
    await expect(feed.getByRole('link', { name: /герой матча/ })).toHaveAttribute('href', '/players/12');
    await expect(feed.getByText('Сегодня')).toBeVisible();
    // With several groups the group is a quiet caption in the bottom row, away from the head and the ⋯ menu.
    await expect(feed.locator('li').first().locator('.feed-reactions .group-tag')).toHaveCount(theme === 'dark' ? 1 : 0);
    await expect(feed.locator('.feed-head .group-tag')).toHaveCount(0);
    const winner = feed.locator('li', { hasText: 'Красные не оставили шансов' });
    await expect(winner.getByRole('button', { name: 'Огонь, 6' })).toHaveAttribute('aria-pressed', 'true');
    await winner.getByRole('button', { name: 'Нравится, 2' }).click();
    await expect(winner.getByRole('button', { name: 'Нравится, 3' })).toHaveAttribute('aria-pressed', 'true');
    await expect(winner.getByRole('button', { name: 'Огонь, 6' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page).toHaveURL(/\/$/);
    await expect(feed.locator('li', { hasText: 'оформляет хет-трик' }).locator('.avatar img')).toBeVisible();
    // No reactions yet: one quiet button that unfolds into the three.
    const hero = feed.locator('li', { hasText: 'герой матча' });
    await expect(hero.getByRole('button')).toHaveCount(4);
    const hatTrick = feed.locator('li', { hasText: 'оформляет хет-трик' });
    await expect(hatTrick.getByRole('group', { name: 'Реакции' }).getByRole('button')).toHaveCount(1);
    await hatTrick.getByRole('button', { name: 'Реакция' }).click();
    await expect(hatTrick.getByRole('group', { name: 'Реакции' }).getByRole('button')).toHaveCount(3);
    await expect(hatTrick.getByRole('button', { name: 'Огонь' })).toBeFocused();
    // The admin's ⋯ menu removes a post after a second, explicit tap.
    await feed.getByRole('button', { name: 'Показать ещё' }).click();
    await expect(feed.getByRole('link')).toHaveCount(7);
    await feed.locator('li', { hasText: 'Матч в цифрах' }).getByRole('button', { name: 'Действия с постом' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Удалить пост' }).click();
    if (theme === 'dark') await page.screenshot({ path: 'artifacts/ui/feed-menu.png' });
    await sheet.getByRole('button', { name: /Точно удалить/ }).click();
    await expect(feed.getByRole('link')).toHaveCount(6);
    await expect(page.getByText('Пост удалён')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Пост удалён')).toBeHidden({ timeout: 10_000 });
    // The last post scrolls clear of the dock.
    await feed.getByRole('link').last().scrollIntoViewIfNeeded();
    const last = await feed.locator('li').last().boundingBox();
    const dock = await page.locator('.nav').boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(dock!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `artifacts/ui/feed-${theme}.png`, fullPage: true });
  });
}
