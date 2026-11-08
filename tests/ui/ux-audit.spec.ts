import { teamApiRoute } from './team-fixture';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Synthetic data only: the UX audit screens (result card, payment mark, leaving the roster, settings sheet).
const community = { id: 1, title: 'Футбол по субботам' };
const me = { userId: 2, displayName: 'Тимур', kaspiPhone: null, profileCompleted: true, communities: [{ ...community, role: 'player' }], rating: { value: 6.2, initial: 6, selfAssessment: { speed: 6 }, matchesCount: 2 } };
const people = ['Алихан', 'Тимур', 'Данияр', 'Арман'].map((name, i) => ({ id: i + 1, seq: i + 1, name, userId: i + 1, guestOfName: null, invitedByUserId: null }));
const finished = { id: 9, community, date: '2026-11-07', status: 'billing', startTime: '21:00', durationHours: 2, place: 'Arena · поле 2', limit: 10, mainCount: 4, reserveCount: 0, my: 'main', protocolVersion: 1, startedAt: 1, completedAt: 2,
  myResult: { teamIndex: 1, teamCount: 3, teamRank: 1, colors: ['red', 'blue', 'yellow'], games: 6, goals: 2, wins: 4, draws: 1, losses: 1 } };
const tasks = [
  { kind: 'payment', id: 'p9', community, eventId: 9, billId: 3, date: '2026-11-07', place: 'Arena · поле 2', due: 2500, receiverName: 'Алихан', receiverKaspiPhone: '+77071234567' },
  { kind: 'review', id: 'r9', community, eventId: 9, date: '2026-11-07', place: 'Arena · поле 2', closesAt: Date.parse('2026-11-10T21:00:00+05:00') },
];
const bill = { id: 3, receiver: { userId: 1, name: 'Алихан', kaspiPhone: '+77071234567' }, fieldAmount: 10000, extras: [], total: 10000, share: 2500, status: 'open', participantSignupIds: [1, 2, 3, 4],
  lines: people.map(p => ({ id: 30 + p.id, userId: p.userId, name: p.name, units: 1, amount: 2500, paidAmount: p.userId === 1 ? 2500 : null, state: p.userId === 1 ? 'paid' : 'unpaid', due: p.userId === 1 ? 0 : 2500 })) };
const upcoming = { id: 7, community, viewerRole: 'player', date: '2026-11-14', status: 'collecting', startTime: null, durationHours: null, place: null, limit: 3, mainCount: 3, reserveCount: 1, my: 'main', comment: null,
  main: people.slice(0, 3), reserve: [people[3]], teams: null, bill: null };

async function mockApp(page: Page, theme: 'dark' | 'light') {
  await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+05:00'));
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await teamApiRoute(page, route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/me' ? { ...me, theme } : path === '/api/notifications' ? { tasks } : path === '/api/events' ? { active: [finished], past: [] }
      : path === '/api/events/9' ? { ...finished, viewerRole: 'player', main: people, reserve: [], teams: null, bill, comment: null }
      : path === '/api/players/2' ? { userId: 2, displayName: 'Тимур', role: 'player', statistics: null, gameHistory: [], history: [] }
      : path === '/api/bills/3/paid' ? { kind: 'ok' } : upcoming;
    return route.fulfill({ json: body });
  });
}

const axe = async (page: Page) => expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

for (const width of [320, 390]) for (const theme of ['dark', 'light'] as const) {
  test(`result card closes the night with the score, payment and survey (${theme} ${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApp(page, theme);
    await page.goto('/');
    const card = page.getByRole('article', { name: 'Синие — первое место' });
    await expect(card).toBeVisible();
    await expect(card.getByRole('link', { name: /Оплатить 2\s500/ })).toHaveAttribute('href', '/event/9?tab=bill');
    await expect(card.getByRole('link', { name: /Оценить матч/ })).toBeVisible();
    await fits(page); await axe(page);
    await page.screenshot({ path: `artifacts/ui/audit-result-card-${theme}-${width}.png`, fullPage: true });
  });
}

test('the payment page opens on payment while billing and promotes the mark after Kaspi', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApp(page, 'dark');
  await page.goto('/event/9');
  await expect(page.getByRole('tab', { name: 'Оплата' })).toHaveAttribute('aria-selected', 'true');
  const card = page.getByRole('region', { name: 'Твоя оплата' });
  await expect(card.getByRole('button', { name: 'Я перевёл' })).toBeVisible();
  await page.evaluate(() => { window.open = () => null; });
  await card.getByRole('button', { name: 'Перевести в Kaspi' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(card.getByRole('button', { name: 'Перевёл? Отметь оплату' })).toBeVisible();
  await axe(page);
  await page.screenshot({ path: 'artifacts/ui/audit-payment-returned-390.png', fullPage: true });
});

test('leaving the main roster names who takes the spot', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await mockApp(page, 'dark');
  await page.goto('/event/7');
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Твоё участие' });
  await expect(sheet.getByText(/перейдёт к Арман/)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Остаюсь' })).toBeVisible();
  await axe(page);
  await page.screenshot({ path: 'artifacts/ui/audit-leave-sheet-320.png' });
});

test('profile settings open as a bottom sheet over the profile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApp(page, 'light');
  await page.goto('/profile');
  await page.getByRole('link', { name: /Изменить имя/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Изменить имя' });
  await expect(sheet.getByLabel('Имя в списках')).toHaveValue('Тимур');
  await expect(page.getByRole('heading', { level: 1, name: 'Профиль' })).toBeAttached();
  await axe(page);
  await page.screenshot({ path: 'artifacts/ui/audit-settings-sheet-light-390.png' });
  await sheet.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page).toHaveURL('/profile');
});
