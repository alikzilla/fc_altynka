import { test, expect } from '@playwright/test';

const me = { userId: 1, displayName: 'Организатор', role: 'admin', kaspiPhone: '+77071234567', profileCompleted: true, community: { id: 1, title: 'Очень длинное название футбольной группы '.repeat(3) } };
const main = [{ id: 1, seq: 1, userId: 1, name: 'Организатор', level: 5, guestOfName: null, invitedByUserId: null }, { id: 2, seq: 2, userId: null, name: 'ДругСОченьДлиннымИменем', level: 5, guestOfName: 'Организатор', invitedByUserId: 1 }];
const event = { id: 1, date: '2026-11-07', status: 'scheduled', startTime: '21:00', durationHours: 1, place: 'Арена', limit: 10, mainCount: 2, reserveCount: 0, my: 'main', comment: null, main, reserve: [], teams: null, bill: null };

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/me' ? me : path === '/api/notifications' ? { tasks: [] } : path === '/api/events' ? { active: [event], past: [] } : path === '/api/matches' ? { events: [], nextCursor: null } : path === '/api/members' ? [{ userId: 1, displayName: me.displayName, role: 'admin', level: 5 }] : event });
  });
});

for (const width of [280, 320, 390, 430]) {
  test(`form controls stay inside their content frame at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 740 });
    for (const path of ['/new', '/event/1/schedule', '/profile/settings/name', '/profile/settings/payment', '/profile/settings/football', '/event/1/guest', '/event/1?tab=bill', '/event/1?tab=teams', '/players']) {
      await page.goto(path);
      const scope = path === '/new' ? page.getByRole('dialog') : page.locator('main');
      await expect(scope).toBeVisible();
      await expect(page.locator('.loading')).toHaveCount(0);
      if (path === '/new') {
        await page.getByLabel('Дата', { exact: true }).fill('2026-12-31');
        await page.getByLabel(/Комментарий/).fill('Длинный комментарий '.repeat(8));
      }
      if (path.endsWith('/schedule')) {
        await page.getByLabel('Начало').fill('23:59');
        await page.getByLabel('Поле · необязательно').fill('Поле с длинным названием '.repeat(3));
      }
      if (path === '/profile/settings/name') await page.getByLabel('Имя в списках').fill('ДлинноеИмяУчастникаКлуба');
      if (path === '/profile/settings/football') {
        await page.getByLabel('Позиция на поле').selectOption('midfielder');
        await page.getByLabel('Рабочая нога').selectOption('both');
      }
      if (path.includes('tab=bill')) {
        await page.getByRole('button', { name: '+ Расход' }).click();
        await page.getByRole('textbox', { name: 'Расход 1', exact: true }).fill('Дополнительные расходы');
        await page.getByRole('spinbutton', { name: 'Сумма расхода 1' }).fill('10000000');
      }
      if (path.includes('tab=teams')) await page.getByRole('button', { name: 'Поделить', exact: true }).click();
      if (path === '/players') await page.getByRole('button', { name: /Организатор/ }).click();
      const issues = await scope.evaluate(root => [...root.querySelectorAll<HTMLElement>('input, select, textarea')].flatMap(el => {
        const box = el.getBoundingClientRect();
        const parent = el.parentElement!;
        const frame = parent.getBoundingClientRect();
        const css = getComputedStyle(parent);
        const left = frame.left + parseFloat(css.paddingLeft) + parseFloat(css.borderLeftWidth);
        const right = frame.right - parseFloat(css.paddingRight) - parseFloat(css.borderRightWidth);
        const height = el.closest('.temporal-field')?.getBoundingClientRect().height ?? box.height;
        const short = !(el instanceof HTMLInputElement && el.type === 'checkbox') && height < 44;
        return box.left < left - 1 || box.right > right + 1 || box.left < 0 || box.right > innerWidth || short ? [{ field: el.outerHTML.slice(0, 120), box: { left: box.left, right: box.right, height }, frame: { left, right } }] : [];
      }));
      expect(issues, `${info.project.name}: ${path}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 320 && (path === '/new' || path.endsWith('/schedule'))) {
        await page.getByRole('heading').first().focus();
        await page.screenshot({ path: `artifacts/ui/input-${info.project.name}-${path === '/new' ? 'date' : 'time'}-320.png` });
      }
    }
  });
}

test('native temporal controls have no horizontal padding to trigger the iOS width bug', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const [path, type] of [['/new', 'date'], ['/event/1/schedule', 'time']]) {
    await page.goto(path);
    const field = page.locator(`input[type="${type}"]`);
    await expect(field).toBeVisible();
    const padding = await field.evaluate(el => { const css = getComputedStyle(el); return parseFloat(css.paddingLeft) + parseFloat(css.paddingRight); });
    // WebKit #301648: percentage-width native date/time + padding can exceed the frame on iOS.
    expect(padding).toBe(0);
    await field.fill(type === 'date' ? '2026-12-31' : '23:59');
    await expect(field).toHaveValue(type === 'date' ? '2026-12-31' : '23:59');
    await field.fill('');
    expect(await field.evaluate(el => (el as HTMLInputElement).validity.valueMissing)).toBe(true);
  }
});
