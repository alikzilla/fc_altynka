import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('teams stay independent when switching, including role, profile and cached match list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const teams = [{ id: 1, title: 'Футбол по субботам' }, { id: 2, title: 'Друзья с работы' }];
  const calls: { path: string; community: string | undefined }[] = [];
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', r => {
    const path = new URL(r.request().url()).pathname;
    const community = r.request().headers()['x-community-id'];
    calls.push({ path, community });
    if (path === '/api/communities') return r.fulfill({ json: { communities: teams } });
    const id = Number(community);
    if (!teams[id - 1]) return r.fulfill({ status: 409, json: { error: 'community_required' } });
    if (path === '/api/me') return r.fulfill({ json: { userId: 7, displayName: id === 1 ? 'Капитан' : 'Игрок', role: id === 1 ? 'organizer' : 'player', profileCompleted: true, community: teams[id - 1], notifications: { enabled: false, available: true }, theme: 'dark' } });
    if (path === '/api/events') return r.fulfill({ json: { active: [{ id: id * 10, date: '2026-12-01', status: 'collecting', place: id === 1 ? 'Поле Субботы' : 'Поле Работы', mainCount: 0, reserveCount: 0, my: null, limit: 10 }], past: [] } });
    return r.fulfill({ json: { tasks: [] } });
  });
  await page.goto('/matches');
  await expect(page.getByRole('heading', { name: 'Твои команды' })).toBeVisible();
  await page.getByRole('button', { name: /Футбол по субботам/ }).click();
  await expect(page.getByText('Поле Субботы')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Создать матч' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Создать матч' }).click();
  await expect(page.getByRole('dialog', { name: 'Новый матч' })).toBeVisible();
  // Close the local form before selecting another team through the persistent control.
  await page.getByRole('button', { name: 'Закрыть создание матча' }).click();
  await page.getByRole('button', { name: 'Сменить команду' }).click();
  await page.getByRole('button', { name: /Друзья с работы/ }).click();
  await expect(page.getByText('Поле Работы')).toBeVisible();
  await expect(page.getByText('Поле Субботы')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Создать матч' })).toHaveCount(0);
  expect(calls.filter(c => c.path === '/api/me').map(c => c.community)).toContain('2');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/ui/communities-selected-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Сменить команду' }).click();
  await page.screenshot({ path: 'artifacts/ui/communities-picker-390.png', fullPage: true });
});

test('a newcomer sees connection instructions without fabricated teams', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/communities', r => r.fulfill({ json: { communities: [] } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Подключи свою команду' })).toBeVisible();
  await expect(page.getByText(/отправь \/bind/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/ui/communities-empty-320.png', fullPage: true });
});
