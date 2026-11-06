import { teamApiRoute } from './team-fixture';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const member = { id: 1, seq: 1, userId: 2, name: 'Айдос Нуспеков', invitedByUserId: null, guestOfName: null, level: 5 };
const names = ['Алихан Садыков', 'Данияр Омаров', 'Руслан Ахметов', 'Тимур Исаев', 'Ерлан Сеитов', 'Арман Ким', 'Марат Касенов', 'Санжар Алиев', 'Нурлан Тлеуов', 'Ильяс Рахимов', 'Дамир Козлов', 'Бекзат Оспанов'];
const roster = names.map((name, i) => ({ ...member, id: i + 3, seq: i + 3, userId: i + 3, name }));
const event = { id: 7, date: '2026-11-08', status: 'scheduled', startTime: '20:00', durationHours: 2, place: 'Arena Football · Абая, 150', comment: 'Возьмите светлую и тёмную футболки.', limit: 15, mainCount: 12, reserveCount: 0, my: null as string | null, main: roster, reserve: [] as typeof roster, teams: null, bill: null as object | null };

for (const width of [320, 390]) for (const theme of ['dark', 'light']) {
  test(`next action and top notifications fit ${width}px ${theme}`, async ({ page }) => {
    let detail = { ...event };
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
    await teamApiRoute(page, r => {
      const path = new URL(r.request().url()).pathname;
      if (path.endsWith('/join')) {
        detail = { ...detail, main: [member, ...roster], mainCount: 13, my: 'main' };
        return r.fulfill({ json: { kind: 'main', position: 1 } });
      }
      return r.fulfill({ json: path === '/api/me' ? { userId: 2, displayName: member.name, role: 'player', kaspiPhone: null, theme } : path === '/api/notifications' ? { tasks: [] } : detail });
    });
    await page.goto('/event/7');
    const action = page.getByRole('region', { name: 'Действие матча' });
    const button = action.getByRole('button', { name: 'Иду', exact: true });
    await expect(button).toBeVisible();
    const initial = (await button.boundingBox())!;
    const dock = (await page.getByRole('navigation').boundingBox())!;
    expect(initial.y + initial.height).toBeLessThanOrEqual(dock.y - 11);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const scrolled = (await button.boundingBox())!;
    expect(Math.abs(scrolled.y - initial.y)).toBeLessThan(1);
    const last = (await page.locator('.person').last().boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(scrolled.y);
    await page.evaluate(() => scrollTo(0, 0));
    await expect(page.getByRole('list', { name: 'Этапы матча' })).toHaveCount(0);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `artifacts/ui/match-redesign-${theme}-${width}.png` });
    await button.click();
    await expect(action).toHaveCount(0);
    await expect(page.locator('.match-personal-status')).toHaveText('Ты в основе');
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    const toastBox = (await toast.boundingBox())!;
    expect(toastBox.y).toBeLessThan(100);
    expect(toastBox.y + toastBox.height).toBeLessThan(initial.y);
    await page.getByRole('button', { name: 'Изменить', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Твоё участие' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toBeFocused();
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Изменить', exact: true })).toBeFocused();
  });

  test(`payment card stays aligned when marked at ${width}px ${theme}`, async ({ page }) => {
    let paid = false;
    const people = [member, ...roster.slice(0, 11)];
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
    await teamApiRoute(page, r => {
      const path = new URL(r.request().url()).pathname;
      if (path.endsWith('/paid')) { paid = true; return r.fulfill({ json: { kind: 'ok' } }); }
      const bill = { id: 3, receiver: { userId: 99, name: 'Руслан Ахметов', kaspiPhone: '+77071234567' }, fieldAmount: 23000, extras: [{ label: 'Вода', amount: 1000 }], total: 24000, share: 2000, status: 'open', participantSignupIds: people.map(p => p.id), lines: people.map(p => ({ id: p.id, userId: p.userId, name: p.name, units: 1, amount: 2000, paidAmount: p.userId === 2 && paid ? 2000 : null, state: p.userId === 2 && paid ? 'paid' : 'unpaid', due: p.userId === 2 && paid ? 0 : 2000 })) };
      return r.fulfill({ json: path === '/api/me' ? { userId: 2, displayName: member.name, role: 'player', kaspiPhone: null, theme } : path === '/api/notifications' ? { tasks: [] } : { ...event, status: 'billing', my: 'main', main: people, bill } });
    });
    await page.goto('/event/7?tab=bill');
    const card = page.getByRole('region', { name: 'Твоя оплата' });
    await expect(card.locator('.payment-label')).toHaveText('К оплате');
    await expect(card.getByRole('button', { name: 'Перевести в Kaspi' })).toBeVisible();
    await expect(page.locator('.match-action')).toHaveCount(0);
    await card.scrollIntoViewIfNeeded();
    const positions = () => card.evaluate(el => {
      const top = el.getBoundingClientRect().top;
      return ['.payment-label', '.payment-amount', '.payment-person'].map(selector => el.querySelector(selector)!.getBoundingClientRect().top - top);
    });
    const before = await positions();
    await page.screenshot({ path: `artifacts/ui/match-payment-${theme}-${width}.png`, fullPage: true });
    await card.getByRole('button', { name: 'Я скинул' }).click();
    await expect(card.locator('.payment-label')).toHaveText('Ты отметил оплату');
    expect(await positions()).toEqual(before);
    await expect(card.getByRole('button', { name: 'Перевести в Kaspi' })).toHaveCount(0);
    await expect(page.locator('.bill-summary')).toContainText(/24\s000/);
  });
}

test('organizer gets one scheduling action with safe areas and a confirmed cancellation menu', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => r.fulfill({ json: new URL(r.request().url()).pathname === '/api/me' ? { userId: 2, displayName: member.name, role: 'organizer', kaspiPhone: '+77071234567' } : new URL(r.request().url()).pathname === '/api/notifications' ? { tasks: [] } : { ...event, status: 'collecting', startTime: null, durationHours: null, my: 'main', main: [member, ...roster] } }));
  await page.goto('/event/7?tab=bill');
  await expect(page.getByRole('link', { name: 'Назначить игру' })).toHaveCount(1);
  await page.evaluate(() => { document.documentElement.style.setProperty('--tg-safe-area-inset-bottom', '34px'); document.documentElement.style.setProperty('--tg-safe-area-inset-top', '24px'); document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', '36px'); });
  const action = (await page.locator('.match-action .btn').boundingBox())!;
  const nav = (await page.getByRole('navigation').boundingBox())!;
  expect(action.y + action.height).toBeLessThanOrEqual(nav.y - 11);
  await page.getByRole('button', { name: 'Действия матча' }).click();
  const dialog = page.getByRole('dialog', { name: 'Действия матча' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Отменить матч', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Точно отменить матч?' })).toBeVisible();
});

test('failed participation shows a top-layer notification above the open sheet', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/leave')) return r.fulfill({ status: 503, json: { error: 'offline' } });
    return r.fulfill({ json: path === '/api/me' ? { userId: 2, displayName: member.name, role: 'player', kaspiPhone: null } : path === '/api/notifications' ? { tasks: [] } : { ...event, my: 'main', main: [member, ...roster] } });
  });
  await page.goto('/event/7');
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Твоё участие' });
  await dialog.getByRole('button', { name: 'Не иду', exact: true }).click();
  const toast = page.locator('.toast');
  await expect(toast).toContainText('Не получилось');
  expect(await toast.evaluate(el => el.matches(':popover-open'))).toBe(true);
  expect((await toast.boundingBox())!.y).toBeLessThan(100);
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: 'artifacts/ui/match-toast-error-320.png' });
});

test('pending cancellation blocks the scheduling link', async ({ page }) => {
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, async r => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/cancel')) { await pending; return r.fulfill({ json: { kind: 'ok' } }); }
    return r.fulfill({ json: path === '/api/me' ? { userId: 2, displayName: member.name, role: 'organizer', kaspiPhone: null } : path === '/api/notifications' ? { tasks: [] } : { ...event, my: 'main', main: [member, ...roster] } });
  });
  try {
    await page.goto('/event/7');
    await page.getByRole('button', { name: 'Действия матча' }).click();
    await page.getByRole('button', { name: 'Отменить матч', exact: true }).click();
    await page.getByRole('button', { name: 'Точно отменить матч?' }).click();
    const link = page.getByRole('dialog').getByRole('link', { name: 'Изменить время и поле' });
    await expect(link).toHaveAttribute('aria-disabled', 'true');
    await link.evaluate(el => (el as HTMLElement).click());
    await expect(page).toHaveURL('/event/7');
  } finally { release(); }
});

test('long participant name keeps the action sheet close button in its frame', async ({ page }) => {
  const longName = 'ДаниярАбдрахмановНурмухамедов'.repeat(2);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => r.fulfill({ json: new URL(r.request().url()).pathname === '/api/me' ? { userId: 2, displayName: member.name, role: 'organizer', kaspiPhone: null } : new URL(r.request().url()).pathname === '/api/notifications' ? { tasks: [] } : { ...event, my: 'main', main: [{ ...member, name: longName }, ...roster] } }));
  await page.goto('/event/7');
  await page.getByRole('button', { name: `Действия: ${longName}` }).click();
  const dialog = page.getByRole('dialog');
  const title = (await dialog.getByRole('heading').boundingBox())!;
  const close = (await dialog.getByRole('button', { name: 'Закрыть' }).boundingBox())!;
  expect(title.x + title.width).toBeLessThanOrEqual(close.x - 10);
  expect(close.x + close.width).toBeLessThanOrEqual(320);
});
