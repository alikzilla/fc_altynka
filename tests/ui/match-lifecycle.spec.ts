import { test, expect } from '@playwright/test';

test('signup remains available before scheduling, then closes and unlocks billing at server kickoff', async ({ page }) => {
  const kickoff = Date.parse('2026-11-08T15:00:00Z');
  // The phone has the wrong calendar date; the server's anchor still controls the boundary.
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.setViewportSize({ width: 390, height: 844 });
  let phase = 'collecting';
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', r => {
    const path = new URL(r.request().url()).pathname;
    return r.fulfill({ json: path === '/api/me' ? { userId: 1, displayName: 'Организатор', role: 'organizer', kaspiPhone: '+77071234567' } : path === '/api/notifications' ? { tasks: [] } : {
      id: 7, date: '2026-11-08', status: phase, serverNow: phase === 'playing' ? kickoff : kickoff - 1000,
      startTime: phase === 'collecting' ? null : '20:00', durationHours: phase === 'collecting' ? null : 2,
      place: 'Arena', limit: 15, mainCount: 1, reserveCount: 0, my: null, comment: null, teams: null, bill: null,
      main: [{ id: 2, seq: 1, userId: 2, name: 'Игрок', guestOfName: null, invitedByUserId: null }], reserve: [],
    } });
  });
  await page.goto('/event/7?tab=bill');
  await expect(page.getByRole('button', { name: 'Иду', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Назначить игру' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выставить счёт', exact: true })).toHaveCount(0);
  phase = 'scheduled';
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await expect(page.getByText('Счёт будет доступен после начала игры')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Иду', exact: true })).toBeVisible();
  phase = 'playing';
  await page.clock.runFor(1200);
  await expect(page.getByText('Игра началась', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Иду', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Выставить счёт', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Выставить счёт' })).toBeVisible();
  await expect(page).toHaveURL('/event/7?tab=bill');
});
