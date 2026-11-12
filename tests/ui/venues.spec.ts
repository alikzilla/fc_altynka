import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const saturday = { id: 1, title: 'Футбол по субботам' };
const work = { id: 2, title: 'Друзья с работы' };
const manege = { id: 1, name: 'Манеж Арена на Толе би с очень длинным названием', address: 'Алматы, улица Толе би, 285/1', mapUrl: 'https://go.2gis.com/abc', hourlyRate: 25000 };
const school = { id: 2, name: 'Школа Аксай', address: null, mapUrl: null, hourlyRate: null };

async function mockApi(page: Page, role: 'organizer' | 'player', theme = 'dark') {
  const sent: { method: string; path: string; body: unknown }[] = [];
  let first = [manege, school];
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', r => {
    const request = r.request(); const url = new URL(request.url());
    if (url.pathname === '/api/me') return r.fulfill({ json: { userId: 1, displayName: 'Алихан', profileCompleted: true, kaspiPhone: null, communities: [{ ...saturday, role }, { ...work, role: 'player' }], notifications: { enabled: false, available: true }, theme } });
    if (url.pathname === '/api/events') return r.fulfill({ json: { active: [], past: [] } });
    if (url.pathname === '/api/notifications') return r.fulfill({ json: { tasks: [] } });
    if (url.pathname.startsWith('/api/venues')) {
      if (request.method() === 'GET') return r.fulfill({ json: { venues: url.searchParams.get('communityId') === '1' ? first : [] } });
      sent.push({ method: request.method(), path: url.pathname, body: request.postDataJSON() });
      if (request.method() === 'PATCH') { first = first.map(v => v.id === 2 ? { ...v, ...request.postDataJSON() } : v); return r.fulfill({ json: { venue: first[1], venues: first } }); }
      if (request.method() === 'DELETE') { first = first.filter(v => v.id !== 1); return r.fulfill({ json: { venues: first } }); }
    }
    return r.fulfill({ json: {} });
  });
  return sent;
}
const axe = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

for (const [width, theme] of [[320, 'dark'], [390, 'light']] as const) test(`organizer opens courts from the menu, edits and deletes at ${width}px ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 780 });
  const sent = await mockApi(page, 'organizer', theme);
  await page.goto('/');
  await page.getByRole('button', { name: 'Меню' }).click();
  await page.getByRole('dialog', { name: 'Меню' }).getByRole('link', { name: 'Площадки' }).click();
  await expect(page).toHaveURL('/venues');
  const group = page.getByRole('region', { name: saturday.title });
  await expect(group.getByRole('heading', { name: manege.name })).toBeVisible();
  await expect(group.getByText('25 000 ₸ / час')).toBeVisible();
  await expect(group.getByRole('link', { name: /Открыть в 2ГИС/ })).toBeVisible();
  // The other group is only viewed: empty and without controls.
  const other = page.getByRole('region', { name: work.title });
  await expect(other.getByRole('heading', { name: 'Площадок пока нет' })).toBeVisible();
  await expect(other.getByRole('button')).toHaveCount(0);
  await fits(page); await axe(page);

  await group.getByRole('button', { name: 'Изменить площадку Школа Аксай' }).click();
  const sheet = page.getByRole('dialog', { name: 'Площадка' });
  await expect(sheet.getByLabel('Название')).toHaveValue('Школа Аксай');
  await sheet.getByLabel(/Адрес/).fill('Аксай-4, 70');
  await expect.poll(() => sheet.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  await fits(page); await axe(page);
  await sheet.getByRole('button', { name: 'Сохранить' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(group.getByText('Аксай-4, 70')).toBeVisible();
  expect(sent.at(-1)).toEqual({ method: 'PATCH', path: '/api/venues/2', body: { name: 'Школа Аксай', address: 'Аксай-4, 70', mapUrl: null, hourlyRate: null } });

  await group.getByRole('button', { name: `Удалить площадку ${manege.name}` }).click();
  await group.getByRole('group', { name: /Удалить площадку/ }).getByRole('button', { name: 'Удалить' }).click();
  await expect(group.getByRole('heading', { name: manege.name })).toHaveCount(0);
  expect(sent.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/venues/1' });
});

test('a player only views courts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await mockApi(page, 'player');
  await page.goto('/venues');
  await expect(page.getByRole('heading', { name: 'Школа Аксай' })).toBeVisible();
  await expect(page.getByText('Цена уточняется')).toBeVisible();
  await expect(page.getByRole('button', { name: /площадку/ })).toHaveCount(0);
  await axe(page);
});
