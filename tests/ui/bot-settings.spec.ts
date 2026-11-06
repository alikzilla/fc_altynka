import { teamApiRoute } from './team-fixture';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [320, 390]) test(`notification preferences preserve initial setup draft and fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  let enabled = true;
  const me = () => ({ userId: 1, displayName: 'Тимур', role: 'player', kaspiPhone: null, profileCompleted: false, notifications: { enabled, available: true } });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/me') {
      if (r.request().method() === 'PATCH') enabled = r.request().postDataJSON().notificationsEnabled;
      return r.fulfill({ json: me() });
    }
    return r.fulfill({ json: { tasks: [] } });
  });
  await page.goto('/profile');
  await page.getByLabel('Имя в списках').fill('Тимур вратарь');
  await page.getByRole('switch', { name: 'Уведомления' }).click();
  await expect(page.getByText('Личные уведомления выключены')).toBeVisible();
  await expect(page.getByLabel('Имя в списках')).toHaveValue('Тимур вратарь');
  await page.getByRole('switch', { name: 'Уведомления' }).click();
  await expect(page.getByText('Личные уведомления включены')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `artifacts/ui/bot-notifications-${width}.png`, fullPage: true });
});

test('organizer sees actual reminder delivery rather than an immediate success claim', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  let reminders = 0;
  const bill = { id: 4, receiver: { userId: 1, name: 'Азамат', kaspiPhone: '+77071234567' }, fieldAmount: 4000, extras: [], total: 4000, share: 2000, status: 'open', lines: [{ id: 1, userId: 1, name: 'Азамат', units: 1, amount: 2000, paidAmount: 2000, state: 'paid', due: 0 }, { id: 2, userId: 2, name: 'Тимур', units: 1, amount: 2000, paidAmount: null, state: 'unpaid', due: 2000 }], participantSignupIds: [1, 2] };
  const ev = { id: 7, date: '2026-11-07', status: 'billing', startTime: '21:00', durationHours: 1, place: 'Шанырак', limit: 10, mainCount: 2, reserveCount: 0, my: 'main', main: [], reserve: [], teams: null, comment: null, bill };
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => {
    const path = new URL(r.request().url()).pathname;
    const json = path === '/api/me' ? { userId: 1, displayName: 'Азамат', role: 'organizer', kaspiPhone: '+77071234567' }
      : path === '/api/notifications' ? { tasks: [] }
      : path.endsWith('/reminder-status') ? { report: reminders ? { at: 1, sent: 0, unavailable: 1, skipped: 0, failed: 0, status: 'complete' } : null }
      : path.endsWith('/remind') ? (reminders++, { kind: 'ok' }) : ev;
    return r.fulfill({ json });
  });
  await page.goto('/event/7?tab=bill');
  await page.getByRole('button', { name: 'Напомнить должникам' }).click();
  await page.getByRole('button', { name: 'Отправить личные напоминания?' }).click();
  await expect(page.getByText('Обработка напоминаний завершена.')).toBeVisible();
  await expect(page.getByText(/Отправлено в личный чат: 0. ЛС недоступны: 1/)).toBeVisible();
  expect(reminders).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/ui/bot-reminders-320.png', fullPage: true });
});
