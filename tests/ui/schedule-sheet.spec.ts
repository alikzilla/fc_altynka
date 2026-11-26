import { teamApiRoute } from './team-fixture';
import { test, expect, type Page } from './fixtures';
import AxeBuilder from '@axe-core/playwright';
import { expectStableSheet, sheetHeight } from './sheet-height';

const draft = { id: 7, date: '2026-11-08', serverNow: Date.parse('2026-11-06T08:00:00Z'), status: 'collecting', startTime: null, durationHours: null, place: null, limit: 10, mainCount: 0, reserveCount: 0, my: null, main: [], reserve: [], teams: null, bill: null, comment: null, community: { id: 1, title: 'FC Altynka' } };
async function setup(page: Page, theme = 'dark') {
  const submissions: unknown[] = [];
  let value: Record<string, unknown> = { ...draft };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(`window.Telegram={WebApp:{initData:'',initDataUnsafe:{},ready(){},expand(){},openLink(url){window.mapUrls=(window.mapUrls||[]).concat(url)},BackButton:{show(){},hide(){},onClick(cb){window.testBack=cb},offClick(cb){if(window.testBack===cb)window.testBack=null}}}}`);
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/me') return r.fulfill({ json: { userId: 1, displayName: 'Организатор', role: 'organizer', profileCompleted: true, theme } });
    if (path === '/api/venues') return r.fulfill({ json: { venues: [{ id: 1, name: 'Школа Аксай', address: null, mapUrl: 'https://go.2gis.com/G47G5', hourlyRate: null }] } });
    if (path === '/api/notifications') return r.fulfill({ json: { tasks: [] } });
    if (path === '/api/events/7/schedule') { const data = r.request().postDataJSON(); submissions.push(data); value = { ...value, ...data, status: 'scheduled' }; return r.fulfill({ json: { kind: 'ok' } }); }
    return r.fulfill({ json: path === '/api/events' ? { active: [value], past: [] } : value });
  });
  return submissions;
}

for (const theme of ['dark', 'light']) for (const width of [320, 390]) {
  test(`appointment and Aksay picker preserve the match and draft at ${width}px in ${theme}`, async ({ page }, info) => {
    const height = width === 320 ? 568 : 844;
    await page.setViewportSize({ width, height });
    const submissions = await setup(page, theme);
    await page.goto('/event/7?tab=bill');
    await page.getByRole('link', { name: 'Назначить матч' }).click();
    const sheet = page.getByRole('dialog', { name: 'Назначить матч', exact: true });
    await expect(sheet.getByLabel('Начало')).toBeVisible();
    await expect(page.locator('main h1')).toHaveText('8 ноября');
    await expect(page.locator('#tab-bill')).toHaveAttribute('aria-selected', 'true');
    await sheet.getByLabel('Начало').fill('22:30');
    await sheet.getByRole('button', { name: /2 часа/ }).click();
    const venueTrigger = sheet.getByRole('button', { name: /Место проведения/ });
    await venueTrigger.click();
    const picker = page.getByRole('dialog', { name: 'Место проведения', exact: true });
    await expect(picker).toBeVisible();
    await expect(picker.locator('.venue-option')).toHaveCount(1);
    await expect(picker.getByRole('button', { name: /^Школа Аксай/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('button', { name: '5×5×5, 15 игроков', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const map = picker.getByRole('link', { name: 'Открыть в 2ГИС' });
    await expect(map).toHaveAttribute('href', 'https://go.2gis.com/G47G5');
    await map.click();
    expect(await page.evaluate(() => (window as unknown as { mapUrls: string[] }).mapUrls)).toEqual(['https://go.2gis.com/G47G5']);
    await page.evaluate(() => dispatchEvent(new Event('focus')));
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await picker.getByRole('heading').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(picker.getByRole('button', { name: 'Выбрать площадку', exact: true })).toBeFocused();
    await picker.getByRole('heading').focus();
    await page.screenshot({ path: `artifacts/ui/${info.project.name}-venue-${theme}-${width}.png` });
    await page.evaluate(() => (window as unknown as { testBack: () => void }).testBack());
    await expect(picker).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await expect(venueTrigger).toBeFocused();
    await expect(venueTrigger).toContainText('Выбрать площадку');
    await venueTrigger.click();
    await picker.getByRole('button', { name: 'Выбрать площадку', exact: true }).click();
    await expect(picker).toHaveCount(0);
    await expect(sheet.getByLabel('Начало')).toHaveValue('22:30');
    await expect(sheet.getByRole('button', { name: /2 часа/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(venueTrigger).toContainText('Школа Аксай');
    const submit = sheet.getByRole('button', { name: 'Назначить матч', exact: true });
    const before = (await submit.boundingBox())!;
    await sheet.locator('.sheet-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
    const after = (await submit.boundingBox())!;
    expect(Math.abs(before.y - after.y)).toBeLessThan(1);
    expect(after.y + after.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `artifacts/ui/${info.project.name}-schedule-${theme}-${width}.png` });
    await submit.click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL('/event/7?tab=bill');
    expect(submissions).toEqual([{ startTime: '22:30', durationHours: 2, limit: 15, place: 'Школа Аксай' }]);
    await expect(page.locator('.match-detail-place')).toContainText('Школа Аксай');
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });
}

test('Escape closes only the top sheet; browser Back with two sheets restores scrolling', async ({ page }) => {
  await setup(page);
  await page.goto('/event/7');
  await page.getByRole('link', { name: 'Назначить матч' }).click();
  const sheet = page.getByRole('dialog', { name: 'Назначить матч', exact: true });
  const trigger = sheet.getByRole('button', { name: /Место проведения/ });
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Место проведения', exact: true })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.goBack();
  await expect(page).toHaveURL('/event/7');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('editing from the match menu replaces it, and closing both sheets restores the match tab', async ({ page }) => {
  await setup(page);
  await page.route('**/api/events/7', r => r.fulfill({ json: { ...draft, status: 'scheduled', startTime: '21:00', durationHours: 1 } }));
  await page.goto('/event/7?tab=teams');
  await page.getByRole('button', { name: 'Действия матча' }).click();
  await page.getByRole('link', { name: 'Изменить время и поле' }).click();
  const sheet = page.getByRole('dialog', { name: 'Изменить время и поле', exact: true });
  await expect(sheet.getByLabel('Начало')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await sheet.getByRole('button', { name: /Место проведения/ }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await sheet.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL('/event/7?tab=teams');
  await expect(page.getByRole('tab', { name: 'Составы' })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

const courts = [
  { id: 1, name: 'Школа Аксай', address: 'Аксай-4, 70', mapUrl: 'https://go.2gis.com/G47G5', hourlyRate: 18000 },
  { id: 2, name: 'Манеж Арена на Толе би', address: 'Толе би, 285', mapUrl: null, hourlyRate: 25000 },
  { id: 3, name: 'Поле у реки', address: null, mapUrl: null, hourlyRate: null },
];
/** Scheduling with courts (two by default: the picker skeleton draws two); `hold` delays the given GET until released. */
async function stableSetup(page: Page, hold: { event?: Promise<void>; venues?: Promise<void> } = {}, count = 2) {
  let venues = courts.slice(0, count);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(`window.Telegram={WebApp:{initData:'',initDataUnsafe:{},ready(){},expand(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}}}}`);
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, async r => {
    const request = r.request(); const path = new URL(request.url()).pathname;
    if (path === '/api/me') return r.fulfill({ json: { userId: 1, displayName: 'Организатор', role: 'organizer', profileCompleted: true } });
    if (path === '/api/notifications') return r.fulfill({ json: { tasks: [] } });
    if (path === '/api/venues') {
      if (request.method() === 'POST') return r.fulfill({ status: 409, json: { error: 'duplicate' } });
      await hold.venues;
      return r.fulfill({ json: { venues } });
    }
    if (path.startsWith('/api/venues/') && request.method() === 'DELETE') { venues = venues.filter(v => v.id !== Number(path.split('/').at(-1))); return r.fulfill({ json: { venues } }); }
    if (path === '/api/events/7') await hold.event;
    return r.fulfill({ json: path === '/api/events' ? { active: [draft], past: [] } : draft });
  });
}
const release = () => { let open = () => {}; const gate = new Promise<void>(resolve => { open = resolve; }); return { gate, open }; };

for (const court of [courts[0], courts[1]]) for (const width of [320, 390]) test(`scheduling keeps its height from skeleton to form and through choosing ${court.mapUrl ? 'a court' : 'a court without a map link'} at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
  const event = release();
  await stableSetup(page, { event: event.gate });
  await page.goto('/event/7/schedule');
  const sheet = page.getByRole('dialog', { name: 'Назначить матч', exact: true });
  await expect(sheet.getByRole('status', { name: 'Загрузка…' })).toBeVisible();
  const skeleton = await sheet.locator('.sheet-content').evaluate(el => el.scrollHeight);
  await expectStableSheet(page, sheet, async () => { event.open(); await expect(sheet.getByLabel('Начало')).toBeVisible(); });
  expect(Math.abs(await sheet.locator('.sheet-content').evaluate(el => el.scrollHeight) - skeleton)).toBeLessThanOrEqual(1);
  await expect(sheet.getByText('Выбери площадку — появится карта')).toBeVisible();
  // The summary takes exactly its outline's box, measured within the scrolling content (the field may scroll into view).
  const place = (selector: string) => sheet.locator(selector).evaluate(el => {
    const content = el.closest('.sheet-content')!; const box = el.getBoundingClientRect();
    return { top: box.top - content.getBoundingClientRect().top + content.scrollTop, height: box.height };
  });
  const outline = await place('.venue-summary-placeholder');
  await expectStableSheet(page, sheet, async () => {
    await sheet.getByRole('button', { name: /Место проведения/ }).click();
    const picker = page.getByRole('dialog', { name: 'Место проведения', exact: true });
    await picker.getByRole('button', { name: new RegExp(`^${court.name}`) }).click();
    await picker.getByRole('button', { name: 'Выбрать площадку', exact: true }).click();
    await expect(picker).toHaveCount(0);
    await expect(sheet.locator('.venue-summary-placeholder')).toHaveCount(0);
  });
  const summary = await place('.venue-summary');
  expect(Math.abs(summary.height - outline.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(summary.top - outline.top)).toBeLessThanOrEqual(1);
  if (court.mapUrl) await expect(sheet.getByRole('link', { name: 'Открыть в 2ГИС' })).toBeVisible();
});

for (const width of [320, 390]) test(`court picker keeps its height while loading, confirming a delete and on a duplicate name at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
  const venues = release();
  await stableSetup(page, { venues: venues.gate });
  await page.goto('/event/7/schedule');
  const sheet = page.getByRole('dialog', { name: 'Назначить матч', exact: true });
  await sheet.getByRole('button', { name: /Место проведения/ }).click();
  const picker = page.getByRole('dialog', { name: 'Место проведения', exact: true });
  await expect(picker.getByRole('status', { name: 'Загрузка…' })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Выбрать площадку', exact: true })).toBeDisabled();
  await expectStableSheet(page, picker, async () => { venues.open(); await expect(picker.locator('li.venue-option')).toHaveCount(2); });
  await expectStableSheet(page, picker, () => picker.getByRole('button', { name: 'Удалить площадку Манеж Арена на Толе би', exact: true }).click());
  await expect(picker.getByRole('group', { name: 'Удалить площадку Манеж Арена на Толе би?' })).toBeVisible();
  await expectStableSheet(page, picker, () => picker.getByRole('group', { name: 'Удалить площадку Манеж Арена на Толе би?' }).getByRole('button', { name: 'Отмена' }).click());
  // The add form is a new step: it starts from its own height, not the taller list's (at 320px both reach the cap).
  const list = await sheetHeight(page, picker);
  await picker.getByRole('button', { name: 'Добавить площадку', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Новая площадка', exact: true });
  await expect(form.getByLabel('Название')).toBeVisible();
  if (width === 390) expect(await sheetHeight(page, form)).toBeLessThan(list - 1);
  await form.getByLabel('Название').fill('Школа Аксай');
  await expectStableSheet(page, form, async () => {
    await form.getByRole('button', { name: 'Добавить площадку', exact: true }).click();
    await expect(form.getByRole('alert')).toHaveText('Площадка с таким названием уже есть');
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('match actions keep their height when cancelling asks for confirmation at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setup(page);
  await page.goto('/event/7');
  await page.getByRole('button', { name: 'Действия матча' }).click();
  const actions = page.getByRole('dialog', { name: 'Действия матча' });
  await expectStableSheet(page, actions, async () => {
    await actions.getByRole('button', { name: 'Отменить матч', exact: true }).click();
    await expect(actions.getByRole('button', { name: 'Точно отменить матч?', exact: true })).toBeVisible();
  });
});
