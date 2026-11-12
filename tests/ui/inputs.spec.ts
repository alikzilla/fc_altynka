import { teamApiRoute } from './team-fixture';
import { test, expect } from '@playwright/test';

const me = { userId: 1, displayName: 'Организатор', role: 'admin', kaspiPhone: '+77071234567', profileCompleted: true, community: { id: 1, title: 'Очень длинное название футбольной группы '.repeat(3) } };
const main = [{ id: 1, seq: 1, userId: 1, name: 'Организатор', level: 5, guestOfName: null, invitedByUserId: null }, { id: 2, seq: 2, userId: null, name: 'ДругСОченьДлиннымИменем', level: 5, guestOfName: 'Организатор', invitedByUserId: 1 }];
const event = { id: 1, date: '2026-11-07', status: 'scheduled', startTime: '21:00', durationHours: 1, place: 'Арена', limit: 10, mainCount: 2, reserveCount: 0, my: 'main', comment: null, main, reserve: [], teams: null, bill: null };

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await teamApiRoute(page, route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/venues' ? { venues: [{ id: 1, name: 'Крытый манеж с очень длинным названием площадки', address: 'Улица с длинным названием, дом 123, корпус 4', mapUrl: 'https://go.2gis.com/G47G5', hourlyRate: 10000000 }] } : path === '/api/me' ? me : path === '/api/notifications' ? { tasks: [] } : path === '/api/events' ? { active: [event], past: [] } : path === '/api/matches' ? { events: [], nextCursor: null } : path === '/api/players' ? [{ userId: 1, displayName: me.displayName, playingPosition: null, dominantFoot: null, rating: { value: 5, initial: 5, selfAssessment: null, matchesCount: 0 } }] : path === '/api/members' ? [{ userId: 1, displayName: me.displayName, role: 'admin', level: 5 }] : { ...event, status: page.url().includes('tab=bill') ? 'playing' : event.status } });
  });
});

for (const width of [280, 320, 390, 430]) {
  test(`form controls stay inside their content frame at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 740 });
    for (const path of ['/new', '/event/1/schedule', '/profile/settings/name', '/profile/settings/payment', '/profile/settings/football', '/event/1?tab=list', '/event/1?tab=bill', '/event/1?tab=teams', '/players']) {
      await page.goto(path);
      let scope = path === '/new' || path.endsWith('/schedule') || path.startsWith('/profile/settings') ? page.getByRole('dialog') : page.locator('main');
      await expect(scope).toBeVisible();
      await expect(page.locator('.loading')).toHaveCount(0);
      if (path === '/new') {
        await page.getByRole('group', { name: 'Дата' }).getByRole('button').nth(13).click();
        await page.getByLabel(/Комментарий/).fill('Длинный комментарий '.repeat(8));
      }
      if (path.endsWith('/schedule')) {
        await page.getByLabel('Начало').fill('23:59');
        await page.getByRole('button', { name: /Место проведения/ }).click();
        await page.getByRole('button', { name: 'Выбрать площадку', exact: true }).click();
      }
      if (path === '/profile/settings/name') await scope.getByLabel('Имя в списках').fill('ДлинноеИмяУчастникаКлуба');
      if (path === '/profile/settings/football') {
        await scope.getByLabel('Позиция на поле').selectOption('midfielder');
        await scope.getByLabel('Рабочая нога').selectOption('both');
      }
      if (path.includes('tab=bill')) {
        await page.getByRole('button', { name: 'Выставить счёт', exact: true }).click();
        scope = page.getByRole('dialog', { name: 'Выставить счёт' });
        await page.getByRole('button', { name: '+ Расход' }).click();
        await page.getByRole('textbox', { name: 'Расход 1', exact: true }).fill('Дополнительные расходы');
        await page.getByRole('spinbutton', { name: 'Сумма расхода 1' }).fill('10000000');
      }
      if (path.includes('tab=list')) {
        await page.getByRole('button', { name: 'Добавить друга', exact: true }).click();
        scope = page.getByRole('dialog', { name: 'Привести друга' });
        await page.getByLabel('Имя друга').fill('ДругСОченьДлиннымИменем');
      }
      if (path.includes('tab=teams')) await page.getByRole('button', { name: 'Разделить на команды', exact: true }).click();
      if (path === '/players') await page.getByRole('button', { name: 'Управление: Организатор', exact: true }).click();
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
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal scroll: ${path}`).toBe(true);
      if (width === 320 && (path === '/new' || path.endsWith('/schedule'))) {
        await page.getByRole('heading').first().focus();
        await page.screenshot({ path: `artifacts/ui/input-${info.project.name}-${path === '/new' ? 'date' : 'time'}-320.png` });
      }
    }
  });
}

test('native temporal controls have no horizontal padding to trigger the iOS width bug', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  // The new match sheet picks its date on a strip of days; the only native temporal control left is the start time.
  for (const [path, type] of [['/event/1/schedule', 'time']]) {
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
