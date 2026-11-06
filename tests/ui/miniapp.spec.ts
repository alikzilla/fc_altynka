import { teamApiRoute } from './team-fixture';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

// Synthetic data: tests never connect to the bot, D1, or a real group.
const me = { userId: 1, displayName: 'Алихан', kaspiPhone: '+77071234567', communities: [{ id: 1, title: 'Футбол по субботам', role: 'admin' }], telegram: { firstName: 'Алихан', lastName: 'Нурланов', username: 'alikhan', photoUrl: null } };
const main = ['Алихан', 'Данияр', 'Тимур', 'Арман', 'Руслан', 'Ерлан', 'Азамат', 'Никита'].map((name, i) => ({ id: i + 1, seq: i + 1, name, userId: i + 1, guestOfName: null, invitedByUserId: null, level: 5 }));
const event = { community: { id: 1, title: 'Футбол по субботам' }, viewerRole: 'admin', id: 1, date: '2026-11-07', status: 'scheduled', startTime: '21:00', durationHours: 1, place: 'Arena • поле № 2', limit: 10, mainCount: 8, reserveCount: 0, my: 'main', comment: 'Берём светлые и тёмные футболки', main, reserve: [], teams: null, bill: null };

test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await teamApiRoute(page, async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path === '/api/me' ? me : path === '/api/events' ? { active: [event], past: [{ ...event, id: 2, date: '2026-10-31', status: 'closed' }] } : path === '/api/notifications' ? { tasks: [{ kind: 'payment', id: 'payment:1', community: event.community, eventId: 2, billId: 2, date: '2026-10-31', place: 'Arena', due: 2500, receiverName: 'Данияр', receiverKaspiPhone: '+77071234567' }] } : path === '/api/matches' ? { events: [{ ...event, id: 2, date: '2026-10-31', status: 'billing' }], nextCursor: null } : path === '/api/players' ? main.map(p => ({ userId: p.userId, displayName: p.name, playingPosition: null, dominantFoot: null, rating: { value: 5, initial: 5, selfAssessment: null, matchesCount: 0 } })) : path === '/api/members' ? main.map(p => ({ userId: p.userId, displayName: p.name, role: 'player', level: 5 })) : { ...event, status: page.url().includes('tab=bill') ? 'playing' : event.status };
    await route.fulfill({ json: body });
  });
});

for (const width of [320, 390, 768, 1440]) {
  test(`main flows fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ближайший матч', exact: true })).toBeVisible();
    await expect(page.getByText('Arena • поле № 2').first()).toBeVisible();
    await page.screenshot({ path: `artifacts/ui/home-${width}.png`, fullPage: true });
    if (width === 390) {
      await mkdir('artifacts/review', { recursive: true });
      // Review-only DOM snapshot with synthetic test data; never part of the app build.
      const css = await page.evaluate(() => [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].map(rule => rule.cssText)).join('\n'));
      const html = (await page.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, '');
      await writeFile('artifacts/review/home.html', html.replace('</head>', `<style>${css}</style></head>`));
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    for (const path of ['/matches', '/matches?view=past', '/notifications', '/event/1', '/event/1?tab=teams', '/event/1?tab=bill', '/profile', '/players', '/new', '/event/1/schedule', '/event/1/guest']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByText('Загрузка…', { exact: true })).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width === 390) {
        expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
        await page.screenshot({ path: `artifacts/ui/${path.replace(/[^a-z0-9]+/gi, '-')}.png`, fullPage: true });
      }
    }
  });
}

test('tabs support keyboard navigation and unknown tabs recover to the list', async ({ page }) => {
  await page.goto('/event/1?tab=unknown');
  const list = page.getByRole('tab', { name: 'Участники' });
  await expect(list).toHaveAttribute('aria-selected', 'true');
  await list.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Составы' })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-teams');
});

test('carousel and all five destinations work on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/events', route => route.fulfill({ json: { active: [event, { ...event, id: 3, date: '2026-11-14', status: 'collecting', startTime: null, durationHours: null, my: null }], past: [] } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Предыдущий матч' })).toBeDisabled();
  await page.getByRole('button', { name: 'Следующий матч' }).click();
  await expect(page.getByText('2 из 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Следующий матч' })).toBeDisabled();
  await page.getByRole('button', { name: 'Предыдущий матч' }).click();
  await expect(page.getByText('1 из 2', { exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  for (const [label, title] of [['Матчи', 'Матчи'], ['Задачи', 'Уведомления'], ['Профиль', 'Профиль'], ['Создать матч', 'Новый матч'], ['Главная', 'Ближайший матч']]) {
    await nav.getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (label === 'Создать матч') await page.getByRole('button', { name: 'Закрыть создание матча' }).click();
  }
});

test('payment obligation opens the real bill and clears after the member marks payment', async ({ page }) => {
  let paid = false;
  await page.route('**/api/me', route => route.fulfill({ json: { ...me, userId: 2, communities: [{ ...me.communities[0], role: 'player' }] } }));
  await page.route('**/api/notifications', route => route.fulfill({ json: { tasks: paid ? [] : [{ kind: 'payment', id: 'payment:2', community: event.community, eventId: 1, billId: 1, date: event.date, place: event.place, due: 2500, receiverName: 'Алихан', receiverKaspiPhone: '+77071234567' }] } }));
  await page.route('**/api/bills/1/paid', route => { paid = true; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/events/1', route => route.fulfill({ json: { ...event, viewerRole: 'player', status: 'billing', bill: {
    id: 1, receiver: { userId: 1, name: 'Алихан', kaspiPhone: '+77071234567' }, fieldAmount: 20000, extras: [], total: 20000, share: 2500, status: 'open', participantSignupIds: main.map(p => p.id),
    lines: main.map(p => ({ id: p.id, userId: p.userId, name: p.name, units: 1, amount: 2500, paidAmount: p.id === 1 || paid && p.id === 2 ? 2500 : null, state: p.id === 1 || paid && p.id === 2 ? 'paid' : 'unpaid', due: p.id === 1 || paid && p.id === 2 ? 0 : 2500 })),
  } } }));
  await page.goto('/notifications');
  await page.getByRole('link', { name: 'Перейти к оплате' }).click();
  await expect(page.getByRole('button', { name: 'Перевести в Kaspi', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Я скинул' }).click();
  await expect(page.locator('.payment-label')).toHaveText('Ты отметил оплату');
  await page.getByRole('navigation').getByRole('link', { name: 'Задачи' }).click();
  await expect(page.getByRole('heading', { name: 'Новых задач нет' })).toBeVisible();
  // A player keeps the dock entry, but the sheet explains that only organizers create matches.
  await page.getByRole('navigation').getByRole('link', { name: 'Создать матч' }).click();
  await expect(page.getByRole('dialog').getByText(/Создавать матчи может организатор/)).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Создать матч' })).toHaveCount(0);
});

test('network error can be retried and empty state offers the next step', async ({ page }) => {
  let failing = true;
  await page.route('**/api/events', route => route.fulfill(failing ? { status: 503, json: { error: 'unavailable' } } : { json: { active: [], past: [] } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Попробовать ещё раз' })).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Попробовать ещё раз' }).click();
  await expect(page.getByRole('heading', { name: 'Нет ближайших матчей' })).toBeVisible();
  await page.getByRole('link', { name: 'Создать матч' }).first().click();
  await expect(page.getByLabel('Дата', { exact: true })).toBeVisible();
});

test('dark theme, safe areas and payment are accessible on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.route('**/api/me', route => route.fulfill({ json: { ...me, userId: 2, communities: [{ ...me.communities[0], role: 'player' }] } }));
  await page.route('**/api/events/1', route => route.fulfill({ json: { ...event, viewerRole: 'player', status: 'billing', bill: {
    id: 1, receiver: { userId: 1, name: 'Алихан', kaspiPhone: '+77071234567' }, fieldAmount: 20000, extras: [], total: 20000, share: 2500, status: 'open', participantSignupIds: main.map(p => p.id),
    lines: main.map(p => ({ id: p.id, userId: p.userId, name: p.name, units: 1, amount: 2500, paidAmount: p.id === 1 ? 2500 : null, state: p.id === 1 ? 'paid' : 'unpaid', due: p.id === 1 ? 0 : 2500 })),
  } } }));
  await page.goto('/event/1?tab=bill');
  await expect(page.getByRole('button', { name: 'Перевести в Kaspi', exact: true })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--tg-safe-area-inset-top', '24px');
    document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', '36px');
    document.documentElement.style.setProperty('--tg-safe-area-inset-bottom', '34px');
  });
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.locator('main').evaluate(el => parseFloat(getComputedStyle(el).paddingTop))).toBeGreaterThanOrEqual(84);
  await page.screenshot({ path: 'artifacts/ui/payment-dark-390.png', fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Игроки', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/ui/home-dark-390.png', fullPage: true });
});

test('long names, venue and expense editor fit a 320px screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route('**/api/events/1', route => route.fulfill({ json: { ...event, status: 'playing', place: 'А'.repeat(80), main: main.map(p => ({ ...p, name: 'ОченьДлинноеИмяУчастника' })) } }));
  await page.goto('/event/1');
  await expect(page.getByText('ОченьДлинноеИмяУчастника').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('tab', { name: 'Оплата', exact: true }).click();
  await page.getByRole('button', { name: 'Выставить счёт', exact: true }).click();
  await page.getByRole('button', { name: '+ Расход', exact: true }).click();
  await page.getByRole('textbox', { name: 'Расход 1', exact: true }).fill('Питьевая вода и дополнительные расходы');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('Airofit dock remains usable while scrolling and respects contrast preferences', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/event/1');
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  const box = (await nav.boundingBox())!;
  expect(box.x).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThan(844);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await nav.getByRole('link', { name: 'Профиль', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Профиль', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Профиль', exact: true })).toHaveAttribute('aria-current', 'page');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  expect(await nav.evaluate(el => getComputedStyle(el).backdropFilter)).toBe('none');
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-contrast', value: 'more' }] });
  expect(await nav.evaluate(el => getComputedStyle(el).backdropFilter)).toBe('none');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'artifacts/ui/profile-contrast-390.png', fullPage: true });
});
