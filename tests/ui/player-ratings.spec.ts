import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';

// All people, matches and ratings below are synthetic browser fixtures, never production data.
test.use({ hasTouch: true });

const skills = { teamwork: 7, dribbling: 6, technique: 7, shooting: 5, stamina: 7, physical: 6, passing: 8, defending: 6 };
const rating = { value: 6.7, initial: 6.5, selfAssessment: skills, matchesCount: 4 };
const people = [
  { userId: 1, displayName: 'Данияр', playingPosition: 'midfielder', dominantFoot: 'right', rating },
  { userId: 2, displayName: 'Арман', playingPosition: 'defender', dominantFoot: 'left', rating: { ...rating, value: 7.2 } },
  { userId: 3, displayName: 'Руслан', playingPosition: 'forward', dominantFoot: 'both', rating: { ...rating, value: 6.3 } },
];

async function mockApp(page: Page, options: { theme?: string; fresh?: boolean; closed?: boolean; open?: boolean } = {}) {
  let assessed = !options.fresh;
  let finished = !!options.open;
  let submitted = false;
  let skipped = false;
  let savedSkills = skills;
  const now = Date.now();
  const review = () => ({ state: options.closed ? 'closed' : !finished ? 'pending' : submitted ? skipped ? 'skipped' : 'submitted' : 'open', canFinish: !finished && !options.closed, completedAt: finished || options.closed ? now : null, closesAt: options.closed ? now - 1000 : now + 72 * 3600000, serverNow: now, gameScore: options.closed ? 8.1 : null,
    participants: people.map(p => ({ userId: p.userId, name: p.displayName, score: options.closed && p.userId !== 3 ? 7.5 : null })), ownSubmission: null });
  const me = () => ({ userId: 1, displayName: 'Данияр', role: 'organizer', kaspiPhone: '+77071234567', profileCompleted: true, playingPosition: 'midfielder', dominantFoot: 'right', theme: options.theme ?? 'dark', rating: assessed ? { ...rating, selfAssessment: savedSkills } : { value: 5, initial: 5, selfAssessment: null, matchesCount: 0 }, community: { id: 1, title: 'FC Altynka' } });
  const match = () => ({ id: 1, date: '2026-11-05', status: 'playing', startTime: '20:00', durationHours: 1, place: 'Шанырак', limit: 10, mainCount: 2, reserveCount: 1, my: 'main', comment: null, main: people.slice(0, 2).map(p => ({ id: p.userId, seq: p.userId, name: p.displayName, userId: p.userId, guestOfName: null, invitedByUserId: null, level: p.rating.value })), reserve: [{ id: 3, seq: 3, name: 'Руслан', userId: 3, guestOfName: null, invitedByUserId: null }], teams: null, bill: null, review: review() });
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body: unknown;
    if (path === '/api/me') body = me();
    else if (path === '/api/me/skills') {
      if (method === 'PUT') { assessed = true; savedSkills = route.request().postDataJSON(); }
      body = { value: Object.values(savedSkills).reduce((sum, n) => sum + n, 0) / 8, initial: 6.5, selfAssessment: savedSkills, matchesCount: 0 };
    } else if (path === '/api/players') body = people;
    else if (path.startsWith('/api/players/')) {
      const person = people.find(p => p.userId === Number(path.split('/').at(-1)))!;
      body = { ...person, rating: person.userId === 1 ? me().rating : person.rating, history: [{ eventId: 1, date: '2026-11-04', place: 'Шанырак', score: 7.5 }, { eventId: 2, date: '2026-11-01', place: null, score: null }] };
    } else if (path === '/api/notifications') body = { tasks: assessed ? finished && !submitted ? [{ kind: 'review', id: 'review:1', eventId: 1, date: '2026-11-05', place: 'Шанырак', closesAt: now + 72 * 3600000 }] : [] : [{ kind: 'skills', id: 'skills' }] };
    else if (path.endsWith('/finish')) { finished = true; body = review(); }
    else if (path.endsWith('/review')) {
      if (method === 'POST') { submitted = true; skipped = route.request().postDataJSON().skipped; }
      body = review();
    } else if (path === '/api/events') body = { active: [match()], past: [] };
    else if (path === '/api/matches') body = { events: [], nextCursor: null };
    else body = match();
    await route.fulfill({ json: body });
  });
}

test('first entry offers the survey, later preserves access, and all eight answers can be saved', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApp(page, { fresh: true });
  await page.goto('/profile');
  await expect(page.getByRole('dialog', { name: 'Как ты играешь?' })).toBeVisible();
  await page.getByRole('button', { name: 'Позже', exact: true }).click();
  await page.getByRole('link', { name: 'Оценить свои навыки', exact: true }).click();
  for (let i = 0; i < 8; i++) {
    await expect(page.getByRole('button', { name: i === 7 ? 'Посмотреть результат' : 'Далее', exact: true })).toBeDisabled();
    const slider = page.getByRole('slider');
    await slider.press('Home');
    for (let j = 0; j < 6; j++) await slider.press('ArrowRight');
    if (i === 0) await page.screenshot({ path: 'artifacts/ratings/question-dark-390.png', fullPage: true });
    await page.getByRole('button', { name: i === 7 ? 'Посмотреть результат' : 'Далее', exact: true }).click();
  }
  await expect(page.getByText('7,0', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/ratings/summary-dark-390.png', fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Сохранить характеристики', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('region', { name: 'Профиль игрока' }).getByRole('group', { name: 'Рейтинг игрока' })).toBeVisible();
  await expect(page.getByText('Самооценка', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const theme of ['dark', 'light']) for (const width of [320, 390, 768, 1440]) {
  test(`ratings and public profiles fit ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockApp(page, { theme });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/profile');
    await expect(page.getByText('6,7', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: `artifacts/ratings/profile-${theme}-${width}.png`, fullPage: true });
    if (width === 390 && theme === 'dark') {
      const css = await page.evaluate(() => [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].map(rule => rule.cssText)).join('\n'));
      const html = (await page.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, '');
      await writeFile('artifacts/ratings/profile-snapshot.html', html.replace('</head>', `<style>${css}</style></head>`));
    }
    await page.getByRole('link', { name: /Игроки команды/ }).click();
    await page.getByRole('searchbox').fill('Арман');
    await expect(page.getByRole('button', { name: /Арман/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Данияр/ })).toHaveCount(0);
    if (width === 390) await page.screenshot({ path: `artifacts/ratings/players-${theme}-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: /Арман/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('7,2', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Kaspi/)).toHaveCount(0);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (width === 390) {
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: `artifacts/ratings/player-sheet-${theme}-${width}.png` });
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/players$/);
    expect(errors).toEqual([]);
  });
}

test('organizer confirms actual players, then submits an anonymous optional review', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApp(page);
  await page.goto('/event/1');
  await page.getByRole('button', { name: 'Завершить игру', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Данияр', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Руслан/ })).not.toBeChecked();
  await page.getByRole('checkbox', { name: /Руслан/ }).check();
  await page.screenshot({ path: 'artifacts/ratings/finish-dark-390.png' });
  await page.getByRole('button', { name: 'Подтвердить участников', exact: true }).click();
  await page.getByRole('link', { name: 'Оценить игру', exact: true }).click();
  await page.getByRole('button', { name: 'Оценить', exact: true }).click();
  const reviewSheet = page.getByRole('dialog', { name: 'Оценка игроков' });
  await expect(reviewSheet.getByLabel('Оценка: Данияр', { exact: true })).toHaveCount(0);
  await reviewSheet.getByRole('slider').press('End');
  await reviewSheet.getByRole('slider').press('ArrowLeft');
  await reviewSheet.getByRole('slider').press('ArrowLeft');
  await reviewSheet.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(reviewSheet.getByRole('heading', { name: 'Руслан', exact: true })).toBeVisible();
  await reviewSheet.getByRole('button', { name: 'Пропустить игрока', exact: true }).click();
  await expect(reviewSheet.getByRole('heading', { name: 'Игра в целом', exact: true })).toBeVisible();
  await reviewSheet.getByRole('slider').press('End');
  await reviewSheet.getByRole('slider').press('ArrowLeft');
  await reviewSheet.locator('.review-step').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))); });
  await expect(reviewSheet.locator('.score-reel')).toHaveAttribute('data-settled', 'true');
  await page.screenshot({ path: 'artifacts/ratings/review-dark-390.png', fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Отправить оценки', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Оценки отправлены', exact: true })).toBeVisible();
});

test('closed results display aggregate scores and insufficient data without vote authors', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockApp(page, { closed: true });
  await page.goto('/event/1/review');
  await expect(page.getByText('Недостаточно оценок', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отправить оценки', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/ratings/closed-dark-320.png', fullPage: true });
});

test('questionnaire slider follows a reversible drag and Next stays above the dock', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mockApp(page, { fresh: true });
  await page.goto('/profile/skills');
  const slider = page.getByRole('slider', { name: 'Игра в команде', exact: true });
  await expect(slider).toBeVisible();
  const next = page.getByRole('button', { name: 'Далее', exact: true });
  await expect(next).toBeDisabled();
  const control = (await slider.boundingBox())!;
  const x = (score: number) => control.x + 16 + (control.width - 32) * (score - 1) / 9;
  const y = control.y + control.height / 2;
  await page.mouse.move(x(5), y); await page.mouse.down();
  await page.mouse.move(x(9), y, { steps: 6 });
  await expect(slider).toHaveValue('9');
  await page.mouse.move(x(3), y, { steps: 6 });
  await expect(slider).toHaveValue('3');
  await page.mouse.move(x(7), y, { steps: 6 }); await page.mouse.up();
  await expect(slider).toHaveValue('7');
  await expect(page.locator('.score-reel')).toHaveAttribute('data-settled', 'true');
  const action = (await next.boundingBox())!;
  const dock = (await page.getByRole('navigation', { name: 'Основная навигация' }).boundingBox())!;
  expect(action.y + action.height).toBeLessThan(dock.y);
  await expect(next).toBeEnabled();
  await page.screenshot({ path: 'artifacts/ratings/slider-drag-dark-320.png' });
  await next.click();
  await expect(page.getByRole('heading', { name: 'Дриблинг', exact: true })).toBeVisible();
});

test('review waits for Next after release, preserves a closed draft and permits going back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApp(page, { open: true });
  const submissions: unknown[] = [];
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/review')) submissions.push(r.postDataJSON()); });
  await page.goto('/event/1/review');
  await page.screenshot({ path: 'artifacts/ratings/review-entry-dark-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Оценить', exact: true }).click();
  const sheet = page.getByRole('dialog');
  const slider = sheet.getByRole('slider', { name: 'Оценка: Арман', exact: true });
  await slider.click({ trial: true });
  const box = (await slider.boundingBox())!;
  const at = (value: number) => box.x + 16 + (box.width - 32) * (value - 1) / 9;
  await page.mouse.move(at(5), box.y + 26); await page.mouse.down();
  await page.mouse.move(at(8), box.y + 26, { steps: 8 });
  await expect(slider).toHaveValue('8');
  await expect(sheet.getByRole('heading', { name: 'Арман', exact: true })).toBeVisible();
  await page.mouse.move(at(8), box.y - 40);
  await page.mouse.up();
  await expect(slider).toBeEnabled();
  await expect(sheet.getByRole('heading', { name: 'Арман', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Руслан', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(sheet.getByRole('slider', { name: 'Оценка: Арман', exact: true })).toHaveValue('8');
  await sheet.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Оценено 1 из 2')).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить оценку', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Руслан', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Пропустить игрока', exact: true }).click();
  await expect(sheet.getByRole('slider', { name: 'Игра в целом', exact: true })).toBeVisible();
  expect(submissions).toEqual([]);
  await sheet.locator('.review-step').evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))); });
  await page.screenshot({ path: 'artifacts/ratings/game-rating-dark-390.png' });
  await sheet.getByRole('button', { name: 'Отправить оценки', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Оценки отправлены', exact: true })).toBeVisible();
  expect(submissions).toEqual([{ scores: [{ userId: 2, score: 8 }], gameScore: null, skipped: false }]);
});

test('cancelled rating drag does not advance, and reduced motion keeps the same flow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApp(page, { open: true });
  await page.goto('/event/1/review');
  await page.getByRole('button', { name: 'Оценить', exact: true }).click();
  const sheet = page.getByRole('dialog');
  const slider = sheet.getByRole('slider');
  await slider.press('End');
  const box = (await slider.boundingBox())!;
  await slider.evaluate(el => el.addEventListener('pointerdown', event => { (el as HTMLElement).dataset.testPointer = String((event as PointerEvent).pointerId); }, { once: true }));
  await page.mouse.move(box.x + box.width - 16, box.y + 26); await page.mouse.down();
  const pointerId = Number(await slider.getAttribute('data-test-pointer'));
  await slider.dispatchEvent('pointercancel', { pointerId, pointerType: 'mouse', isPrimary: true });
  await page.mouse.up();
  await expect(sheet.getByRole('heading', { name: 'Арман', exact: true })).toBeVisible();
  await expect(sheet.locator('.score-reel')).toHaveAttribute('data-settled', 'true');
  expect(await sheet.locator('.review-step').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await sheet.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Руслан', exact: true })).toBeVisible();
});

test('native touch rating waits for Next and keeps the sheet open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApp(page, { open: true });
  await page.goto('/event/1/review');
  await page.getByRole('button', { name: 'Оценить', exact: true }).click();
  const sheet = page.getByRole('dialog');
  const slider = sheet.getByRole('slider');
  await slider.click({ trial: true });
  const box = (await slider.boundingBox())!;
  await page.touchscreen.tap(box.x + 16 + (box.width - 32) * 7 / 9, box.y + 26);
  await expect(slider).toHaveValue('8');
  await expect(sheet.getByRole('heading', { name: 'Арман', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Руслан', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(sheet.getByRole('slider', { name: 'Оценка: Арман', exact: true })).toHaveValue('8');
});

test('trusted touch dragging follows the finger and waits for Next after release', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP trusted touch injection is Chromium-only; native tapping is tested separately.');
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApp(page, { open: true });
  await page.goto('/event/1/review');
  await page.getByRole('button', { name: 'Оценить', exact: true }).click();
  const sheet = page.getByRole('dialog');
  const slider = sheet.getByRole('slider');
  await slider.click({ trial: true });
  const box = (await slider.boundingBox())!;
  const at = (value: number) => box.x + 16 + (box.width - 32) * (value - 1) / 9;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const point = (x: number, id = 1) => ({ x, y: box.y + 26, id });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(at(5))] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(at(5 + i * 3 / 8))] });
  await expect(slider).toHaveValue('8');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(at(8)), point(at(2), 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point(at(8))] });
  await expect(sheet.getByRole('heading', { name: 'Арман', exact: true })).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(slider).toHaveValue('8');
  await expect(sheet.getByRole('heading', { name: 'Арман', exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Руслан', exact: true })).toBeVisible();
  await expect(sheet).toBeVisible();
  await cdp.detach();
});

test('a failed final review retains ratings and can be submitted again', async ({ page }) => {
  await mockApp(page, { open: true });
  let attempts = 0;
  await page.route('**/api/events/1/review', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, json: { error: 'offline' } });
    return route.fallback();
  });
  await page.goto('/event/1/review');
  await page.getByRole('button', { name: 'Оценить', exact: true }).click();
  const sheet = page.getByRole('dialog');
  for (let i = 0; i < 2; i++) await sheet.getByRole('button', { name: 'Пропустить игрока', exact: true }).click();
  await expect(sheet.getByRole('slider', { name: 'Игра в целом', exact: true })).toBeVisible();
  await sheet.getByRole('slider').press('End');
  await sheet.getByRole('button', { name: 'Отправить оценки', exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText('Не получилось отправить');
  await expect(sheet.getByRole('slider')).toHaveValue('10');
  await sheet.getByRole('button', { name: 'Отправить оценки', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Оценки отправлены', exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test('voting deadline closes an open sheet without sending its draft', async ({ page }) => {
  await mockApp(page, { open: true });
  let reads = 0; let writes = 0;
  const now = Date.now();
  await page.route('**/api/events/1/review', async route => {
    if (route.request().method() === 'POST') { writes++; return route.fallback(); }
    reads++;
    await route.fulfill({ json: { state: reads > 1 ? 'closed' : 'open', canFinish: false, completedAt: now - 1000, closesAt: now + 1200, serverNow: reads > 1 ? now + 1201 : now, gameScore: null, participants: people.map(p => ({ userId: p.userId, name: p.displayName, score: null })), ownSubmission: null } });
  });
  await page.goto('/event/1/review');
  await page.getByRole('button', { name: 'Оценить', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Оценки за матч', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toBe(0);
});
