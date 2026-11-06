import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const saturday = { id: 1, title: 'Футбол по субботам' };
const work = { id: 2, title: 'Друзья с работы' };
const match = (id: number, community: typeof saturday, place: string) => ({ id, date: '2026-12-01', status: 'collecting', place, mainCount: 0, reserveCount: 0, my: null, limit: 10, startTime: null, durationHours: null, community });

async function mockApi(page: Page, communities: { id: number; title: string; role: string }[]) {
  const calls: string[] = [];
  const headers: (string | undefined)[] = [];
  const posts: unknown[] = [];
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', r => {
    const request = r.request();
    const path = new URL(request.url()).pathname;
    calls.push(path);
    headers.push(request.headers()['x-community-id']);
    if (path === '/api/events' && request.method() === 'POST') { posts.push(request.postDataJSON()); return r.fulfill({ json: { id: 99 } }); }
    if (path === '/api/communities' || path === '/api/context') return r.fulfill({ status: 404, json: { error: 'not_found' } });
    if (path === '/api/me') return r.fulfill({ json: { userId: 7, displayName: 'Капитан', profileCompleted: true, kaspiPhone: null, communities, notifications: { enabled: false, available: true }, theme: 'dark' } });
    const events = communities.map(c => match(c.id * 10, c, `Поле ${c.id}`));
    if (path === '/api/events') return r.fulfill({ json: { active: events, past: [] } });
    if (path === '/api/matches') return r.fulfill({ json: { events: [], nextCursor: null } });
    if (path === '/api/notifications') return r.fulfill({ json: { tasks: [] } });
    if (path === '/api/players') return r.fulfill({ json: { groups: communities.map(c => ({ community: { id: c.id, title: c.title }, role: c.role, players: [{ userId: 7 + c.id, displayName: `Игрок ${c.id}`, playingPosition: null, dominantFoot: null, rating: { value: 5, initial: 5, selfAssessment: null, matchesCount: 0 } }] })) } });
    if (path === '/api/members') return r.fulfill({ json: [] });
    return r.fulfill({ json: {} });
  });
  return { calls, headers, posts };
}
const dock = (page: Page) => page.getByRole('navigation', { name: 'Основная навигация' });
const axe = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

test('a person without groups opens the profile and sees connection instructions in an empty feed', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const { headers } = await mockApi(page, []);
  await page.goto('/profile');
  await expect(page.getByText('Капитан').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Твои команды' })).toHaveCount(0);
  await page.goto('/matches');
  await expect(page.getByRole('heading', { name: 'Нет активных матчей' })).toBeVisible();
  await expect(page.getByText(/Добавь бота в Telegram-группу/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить в группу' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сменить' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(headers.every(h => h === undefined)).toBe(true);
  await dock(page).getByRole('link', { name: 'Создать матч' }).click();
  const sheet = page.getByRole('dialog', { name: 'Новый матч' });
  await expect(sheet.getByText(/Добавь бота в Telegram-группу/)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Добавить в группу' })).toBeVisible();
  await expect(sheet.locator('form')).toHaveCount(0);
  await axe(page);
  await page.screenshot({ path: 'artifacts/ui/communities-empty-320.png', fullPage: true });
});

test('one group shows no switcher, group field or tags', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { posts } = await mockApi(page, [{ ...saturday, role: 'organizer' }]);
  await page.goto('/matches');
  await expect(page.getByText('Поле 1')).toBeVisible();
  await expect(page.getByText('Сменить')).toHaveCount(0);
  await expect(page.getByText(saturday.title)).toHaveCount(0);
  await dock(page).getByRole('link', { name: 'Создать матч' }).click();
  const sheet = page.getByRole('dialog', { name: 'Новый матч' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('radiogroup')).toHaveCount(0);
  await expect(sheet.getByText('Группа', { exact: true })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Создать матч' })).toBeEnabled();
  await sheet.getByRole('button', { name: 'Создать матч' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ communityId: saturday.id });
  await axe(page);
});

test('two groups tag cards and require choosing a group before creating', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [{ ...saturday, role: 'organizer' }, { ...work, role: 'admin' }]);
  await page.goto('/matches');
  await expect(page.getByText('Поле 1')).toBeVisible();
  await expect(page.getByText('Поле 2')).toBeVisible();
  await expect(page.getByText(saturday.title).first()).toBeVisible();
  await expect(page.getByText(work.title).first()).toBeVisible();
  await expect(page.getByText('Сменить')).toHaveCount(0);
  await axe(page);
  await dock(page).getByRole('link', { name: 'Создать матч' }).click();
  const sheet = page.getByRole('dialog', { name: 'Новый матч' });
  const group = sheet.getByRole('radiogroup');
  await expect(group).toBeVisible();
  await expect(group.getByRole('radio')).toHaveCount(2);
  const submit = sheet.getByRole('button', { name: 'Открыть запись' });
  await expect(submit).toBeDisabled();
  await group.getByText(work.title).click();
  await expect(submit).toBeEnabled();
  await axe(page);
  await page.screenshot({ path: 'artifacts/ui/communities-picker-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Закрыть создание матча' }).click();
  await page.goto('/players');
  await expect(page.getByRole('heading', { name: 'Игроки', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: saturday.title, level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: work.title, level: 2 })).toBeVisible();
});

test('organizer rights follow the match group, not a global role', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const detail = (id: number, community: typeof saturday, viewerRole: string) => ({ id, date: '2026-12-01', status: 'collecting', startTime: null, durationHours: null, place: null, limit: 10, mainCount: 0, reserveCount: 0, my: null, comment: null, main: [], reserve: [], teams: null, bill: null, community, viewerRole });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', r => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/me') return r.fulfill({ json: { userId: 7, displayName: 'Капитан', profileCompleted: true, kaspiPhone: null, communities: [{ ...saturday, role: 'organizer' }, { ...work, role: 'player' }], notifications: { enabled: false, available: true }, theme: 'dark' } });
    if (path === '/api/events/10') return r.fulfill({ json: detail(10, saturday, 'organizer') });
    if (path === '/api/events/20') return r.fulfill({ json: detail(20, work, 'player') });
    if (path === '/api/notifications') return r.fulfill({ json: { tasks: [] } });
    return r.fulfill({ json: [] });
  });
  await page.goto('/event/10/schedule');
  await expect(page.getByRole('dialog', { name: 'Назначить игру' })).toBeVisible();
  await expect(page.getByText('Игру назначает организатор')).toHaveCount(0);
  await page.goto('/event/20/schedule');
  await expect(page.getByText('Игру назначает организатор')).toBeVisible();
});
