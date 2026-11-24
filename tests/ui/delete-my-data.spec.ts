import AxeBuilder from '@axe-core/playwright';
import { teamApiRoute } from './team-fixture';
import { expect, test } from './fixtures';

for (const [width, theme] of [[320, 'dark'], [390, 'light']] as const) test(`delete my data: one confirmation, fits ${width}px ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 780 });
  const deletes: unknown[] = [];
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => {
    const { pathname } = new URL(r.request().url());
    if (pathname === '/api/me' && r.request().method() === 'DELETE') { deletes.push(r.request().postDataJSON()); return r.fulfill({ json: { deleted: true } }); }
    return r.fulfill({ json: pathname === '/api/me'
      ? { userId: 2, displayName: 'Тимур', role: 'player', kaspiPhone: null, profileCompleted: true, theme, notifications: { enabled: false, available: true } }
      : { tasks: [] } });
  });
  await page.goto('/profile');
  await page.getByRole('button', { name: /Удалить мои данные/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Удалить мои данные?' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Отменить удаление нельзя.')).toBeVisible();
  expect((await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `artifacts/ui/delete-my-data-${width}-${theme}.png` });
  await sheet.getByRole('button', { name: 'Удалить навсегда' }).click();
  await expect(page.getByRole('dialog', { name: 'Данные удалены' })).toBeVisible();
  expect(deletes).toEqual([{ confirm: 'delete' }]);
});
