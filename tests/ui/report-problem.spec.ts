import AxeBuilder from '@axe-core/playwright';
import { teamApiRoute } from './team-fixture';
import { expect, test } from './fixtures';

for (const [width, theme] of [[320, 'dark'], [390, 'light']] as const) test(`report a problem and see the version at ${width}px ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 780 });
  const reports: { text: string; version: string }[] = [];
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => {
    const { pathname } = new URL(r.request().url());
    if (pathname === '/api/feedback') { reports.push(r.request().postDataJSON()); return r.fulfill({ json: { sent: true } }); }
    return r.fulfill({ json: pathname === '/api/me'
      ? { userId: 2, displayName: 'Тимур', role: 'player', kaspiPhone: null, profileCompleted: true, theme, notifications: { enabled: false, available: true } }
      : { tasks: [] } });
  });
  await page.goto('/profile');
  // The production build carries the real commit, never the test fallback.
  const version = page.getByText(/^Версия /);
  await expect(version).toBeVisible();
  await expect(version).not.toHaveText(/dev/);
  await page.getByRole('button', { name: /Сообщить о проблеме/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Сообщить о проблеме' });
  await sheet.getByLabel('Что случилось?').fill('Список не обновился после записи');
  // The sheet slides in; check contrast once it has arrived.
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => undefined))));
  expect((await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `artifacts/ui/report-problem-${width}-${theme}.png` });
  await sheet.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Отправили. Спасибо!')).toBeVisible();
  expect(reports).toHaveLength(1);
  expect(reports[0].text).toBe('Список не обновился после записи');
  expect(reports[0].version).toMatch(/^[0-9a-f]{7,}\+?$/);
});
