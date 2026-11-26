import { teamApiRoute } from './team-fixture';
import { expect, test, type Locator, type Page } from './fixtures';
import { expectStableSheet, sheetHeight } from './sheet-height';

// Sheets of the profile, feed, help, new match and review: a sheet never changes its height while it is open.
// All people, groups and matches are synthetic browser fixtures, never production data.
const community = { id: 1, title: 'FC Altynka' };
const me = { userId: 2, displayName: 'Тимур', role: 'player', kaspiPhone: null, profileCompleted: true, notifications: { enabled: false, available: true } };
const widths = [320, 390];

async function boot(page: Page, width: number, handler: (path: string, method: string, route: import('@playwright/test').Route) => unknown) {
  // Tall viewport: the sheet's own height is measured, never the cap of a short screen.
  await page.setViewportSize({ width, height: 1400 });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => handler(new URL(r.request().url()).pathname, r.request().method(), r));
}

for (const width of widths) test(`delete my data: the «deleted» step recalculates the height and the error fits at ${width}px`, async ({ page }) => {
  let fail = true;
  await boot(page, width, (path, method, r) => {
    if (path === '/api/me' && method === 'DELETE') return fail ? r.fulfill({ status: 409, json: { error: 'receiver_open_bill' } }) : r.fulfill({ json: { deleted: true } });
    return r.fulfill({ json: path === '/api/me' ? me : { tasks: [] } });
  });
  await page.goto('/profile');
  await page.getByRole('button', { name: /Удалить мои данные/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Удалить мои данные?' });
  await expect(sheet).toBeVisible();
  // Страховка: an error expected only for a receiver of an open bill adds its lines to the footer; it is not reserved.
  await sheet.getByRole('button', { name: 'Удалить навсегда' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Попроси организатора закрыть счёт');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  fail = false;
  const before = await sheetHeight(page, sheet);
  await sheet.getByRole('button', { name: 'Удалить навсегда' }).click();
  const done = page.getByRole('dialog', { name: 'Данные удалены' });
  await expect(done).toBeVisible();
  // «Deleted» is a new step: the short text is not padded to the height of the long list.
  expect(await sheetHeight(page, done)).toBeLessThan(before - 20);
});

for (const width of widths) test(`profile settings: an expected error has its line already at ${width}px`, async ({ page }) => {
  await boot(page, width, (path, method, r) => {
    if (path === '/api/me' && method === 'PATCH') return r.fulfill({ status: 409, json: { error: 'name_taken' } });
    return r.fulfill({ json: path === '/api/me' ? me : { tasks: [] } });
  });
  await page.goto('/profile/settings/payment');
  const payment = page.getByRole('dialog', { name: 'Оплата' });
  await payment.getByLabel('Номер Kaspi').fill('abc');
  await expectStableSheet(page, payment, async () => {
    await payment.getByRole('button', { name: 'Сохранить' }).click();
    await expect(payment.getByRole('alert')).toHaveText('Проверь номер');
  });
  await page.goto('/profile/settings/name');
  const name = page.getByRole('dialog', { name: 'Изменить имя' });
  await name.getByLabel('Имя в списках').fill('Арман');
  await expectStableSheet(page, name, async () => {
    await name.getByRole('button', { name: 'Сохранить' }).click();
    await expect(name.getByRole('alert')).toContainText('Это имя уже занято');
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of widths) test(`report a problem: a refusal fits the footer at ${width}px`, async ({ page }) => {
  await boot(page, width, (path, method, r) => {
    if (path === '/api/feedback') return r.fulfill({ status: 429, json: { error: 'too_often' } });
    return r.fulfill({ json: path === '/api/me' ? me : { tasks: [] } });
  });
  await page.goto('/profile');
  await page.getByRole('button', { name: /Сообщить о проблеме/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Сообщить о проблеме' });
  await sheet.getByLabel('Что случилось?').fill('Не открывается список');
  // Страховка: a rare refusal adds its lines to the footer; it fits and is announced.
  await sheet.getByRole('button', { name: 'Отправить' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Только что отправляли');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const post = { id: 7, kind: 'summary', text: 'Матч в цифрах: 9 игр, 21 гол. Очень длинная подпись, чтобы описание шторки заняло несколько строк на узком экране.', highlights: [], createdAt: Date.parse('2026-11-07T17:00:00Z'), eventId: 2, eventDate: '2026-11-07', community, userId: null, teamColor: null, player: null, reactions: { fire: 0, good: 0, bad: 0 } };
const hero = { ...post, id: 8, kind: 'hero', text: 'Айкын — герой матча: 2 гола и 2 передачи.', highlights: ['Айкын'], userId: 12, player: { userId: 12, name: 'Айкын', photoUrl: null } };
const statistics = { awards: { mvp: 0, forward: 0, midfielder: 0, defender: 0, goalkeeper: 0 }, mvps: 0, positionAwards: 0, meetings: 12, games: 48, goals: 50, assists: 11, assistsTracked: true, wins: 24, draws: 9, losses: 15, winPercentage: 50, bestGoalsInMeeting: 6, hatTricks: 5 };
const meetings = [9, 8, 7].map(day => ({ eventId: day, date: `2026-11-0${day}`, place: day === 9 ? 'Школа Аксай' : null, community, colors: ['red', 'blue', 'yellow'], games: 1, goals: 1, wins: 1, draws: 0, losses: 0, score: null, results: [{ id: `g${day}`, sequence: 1, pair: [0, 1], score: [2, 1], goals: 1, outcome: 'win' }] }));
const profile = { userId: 12, displayName: 'Айкын', playingPosition: 'forward', dominantFoot: 'right', role: 'player', telegramUsername: 'aikyn', pinnedAchievement: 'scorer' as string | null, rating: { value: 6.8, initial: 6, selfAssessment: { teamwork: 6, dribbling: 6, technique: 6, shooting: 6, stamina: 6, physical: 6, passing: 6, defending: 6 }, matchesCount: 4 }, statistics, history: [], gameHistory: meetings };

async function feedApp(page: Page, width: number, extra?: (path: string, method: string, r: import('@playwright/test').Route) => unknown) {
  await page.clock.setFixedTime(new Date('2026-11-09T09:00:00Z'));
  await boot(page, width, async (path, method, r) => {
    const handled = await extra?.(path, method, r);
    if (handled) return;
    if (method !== 'GET') return r.fulfill({ json: {} });
    return r.fulfill({ json: path === '/api/me' ? { ...me, userId: 1, communities: [{ ...community, role: 'admin' }] } : path === '/api/events' ? { active: [], past: [] }
      : path === '/api/notifications' ? { tasks: [] } : path === '/api/feed' ? { posts: [hero, post] } : /^\/api\/players\/\d+$/.test(path) ? profile : {} });
  });
}

for (const width of widths) test(`feed post menu: the second tap on «Удалить пост» keeps the sheet height at ${width}px`, async ({ page }) => {
  await feedApp(page, width);
  await page.goto('/');
  await page.locator('li', { hasText: 'Матч в цифрах' }).getByRole('button', { name: 'Действия с постом' }).click();
  const sheet = page.getByRole('dialog', { name: 'Пост в ленте' });
  await expectStableSheet(page, sheet, async () => {
    await sheet.getByRole('button', { name: 'Удалить пост' }).click();
    await expect(sheet.getByRole('button', { name: /Точно удалить/ })).toBeVisible();
  });
  expect(await sheet.getByRole('button', { name: /Точно удалить/ }).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});

for (const width of widths) test(`player profile sheet: the skeleton is as tall as the profile at ${width}px`, async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await feedApp(page, width, async (path, method, r) => {
    if (method === 'GET' && /^\/api\/players\/\d+$/.test(path)) { await gate; await r.fulfill({ json: profile }); return true; }
    return false;
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /герой матча/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Профиль игрока' });
    await expect(sheet.getByRole('status', { name: 'Загрузка…' })).toBeAttached();
    const skeleton = await sheetHeight(page, sheet);
    release();
    await expect(sheet.getByText('@aikyn')).toBeVisible();
    const loaded = await sheetHeight(page, sheet);
    expect(Math.abs(loaded - skeleton), `каркас ${skeleton}, профиль ${loaded}`).toBeLessThanOrEqual(1);
  } finally { release(); }
});

for (const width of widths) test(`player profile: pinning an achievement and opening a match row keep the sheets steady at ${width}px`, async ({ page }) => {
  let refuse = true;
  await page.setViewportSize({ width, height: 1400 });
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, r => {
    const { pathname } = new URL(r.request().url());
    if (r.request().method() === 'PATCH') return refuse ? r.fulfill({ status: 409, json: { error: 'fail' } }) : r.fulfill({ json: { ...me, userId: 12, ...profile, pinnedAchievement: 'winner' } });
    return r.fulfill({ json: pathname === '/api/me' ? { ...me, userId: 12, ...profile, communities: [{ ...community, role: 'player' }] } : pathname === '/api/notifications' ? { tasks: [] } : profile });
  });
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Все достижения' }).click();
  const list = page.getByRole('dialog', { name: 'Достижения' });
  await list.getByRole('button', { name: /Победитель/ }).click();
  const detail = page.getByRole('dialog').last();
  // Страховка: a refusal is rare, its line joins the footer and is announced.
  await detail.getByRole('button', { name: 'Закрепить в профиле' }).click();
  await expect(detail.getByRole('alert')).toContainText('Не получилось закрепить');
  // The list behind keeps its height when the «в профиле» mark lands on a row (the mark may wrap the row's title).
  refuse = false;
  await expectStableSheet(page, list, async () => {
    await detail.getByRole('button', { name: 'Закрепить в профиле' }).click();
    await expect(list.getByText('в профиле', { exact: true })).toBeVisible();
  });
  await expect(detail.getByRole('button', { name: 'Закреплено в профиле ✓' })).toBeDisabled();
  await detail.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await list.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('region', { name: 'Сыгранные матчи' }).locator('.player-meeting-row').first().click();
  const games = page.getByRole('dialog', { name: /^Игры за/ });
  await expect(games.locator('.player-short-game')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const groups = [{ ...community, role: 'organizer' }, { id: 2, title: 'Футбол по средам', role: 'organizer' }];
const day = (date: string, yes: number) => ({ date, unknown: 3, yes: Array.from({ length: yes }, (_, i) => ({ userId: 20 + i, name: `Игрок ${i}`, parts: ['evening'] })), no: [] });
async function openNew(page: Page, width: number, summary: (route: import('@playwright/test').Route) => unknown, multi = true) {
  await boot(page, width, (path, method, r) => {
    if (path === '/api/availability/summary') return summary(r);
    return r.fulfill({ json: path === '/api/me' ? { ...me, communities: multi ? groups : [groups[0]] } : path === '/api/events' ? { active: [], past: [] } : { tasks: [] } });
  });
  await page.goto('/new');
  return page.getByRole('dialog', { name: 'Новый матч' });
}
const days = () => Array.from({ length: 7 }, (_, i) => day(new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10), i % 2 ? 0 : 2));

async function outline(sheet: Locator) {
  const box = sheet.locator('.sheet-placeholder');
  const [frame, ghost] = await Promise.all([box.boundingBox(), box.locator('.sheet-placeholder-ghost').boundingBox()]);
  return { frame: frame!.height, ghost: ghost!.height };
}

for (const width of widths) test(`new match: the group hint is no taller than the summary row, the summary arrives in place at ${width}px`, async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const sheet = await openNew(page, width, async r => { await gate; return r.fulfill({ json: { community, days: days() } }); });
  try {
    await expect(sheet).toBeVisible();
    const hint = sheet.getByText('Выбери группу — здесь появится, сколько человек может');
    await expect(hint).toBeVisible();
    const { frame, ghost } = await outline(sheet);
    expect(Math.abs(frame - ghost), `рамка ${frame}, содержимое ${ghost}`).toBeLessThanOrEqual(1);
    await expectStableSheet(page, sheet, async () => {
      await sheet.getByLabel('Группа').selectOption({ label: 'FC Altynka' });
      await expect(hint).toHaveCount(0);
    });
    await expectStableSheet(page, sheet, async () => { release(); await expect(sheet.locator('.summary-line:not([aria-hidden])')).toBeVisible(); });
    // A day with no marks and a day with a summary share one cell: switching between them never moves the sheet.
    const strip = sheet.getByRole('group', { name: 'Дата' });
    await expectStableSheet(page, sheet, async () => { await strip.getByRole('button').nth(1).click(); });
    await expectStableSheet(page, sheet, async () => { await strip.getByRole('button').nth(12).click(); await expect(sheet.getByText(/На этот день отметок ещё нет/)).toBeVisible(); });
    await expectStableSheet(page, sheet, async () => { await strip.getByRole('button').nth(0).click(); });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { release(); }
});

for (const width of widths) test(`new match: one group — the summary place is reserved while loading at ${width}px`, async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const sheet = await openNew(page, width, async r => { await gate; return r.fulfill({ json: { community, days: days() } }); }, false);
  try {
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.sheet-placeholder')).toHaveCount(0);
    await expectStableSheet(page, sheet, async () => { release(); await expect(sheet.locator('.summary-line:not([aria-hidden])')).toBeVisible(); });
  } finally { release(); }
});

const names = ['Арман', 'Руслан', 'Александр Константинопольский-Нурланов', 'Ерлан'];
const stats = (n: number) => ({ games: 6, goals: n, assists: n % 2, wins: 4, draws: 1, losses: 1, assistsTracked: true });
const now = Date.now();
const reviewDto = { state: 'open', canFinish: false, completedAt: now, closesAt: now + 72 * 3600000, serverNow: now, gameScore: null, ownSubmission: null, awards: null,
  participants: [{ userId: 1, name: 'Тимур', score: null }, ...names.map((name, i) => ({ userId: 10 + i, name, score: null, ...(i % 2 ? {} : { stats: stats(i + 1) }) }))] };

for (const width of widths) test(`match rating: every step, the prizes and the summary keep one height at ${width}px`, async ({ page }) => {
  await boot(page, width, (path, method, r) => r.fulfill({ json: path === '/api/me' ? { ...me, userId: 1 } : path === '/api/notifications' ? { tasks: [] } : path.endsWith('/review') ? reviewDto : {} }));
  await page.goto('/event/1/review');
  await page.getByRole('button', { name: 'Оценить', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Оценка матча' });
  await expect(sheet).toBeVisible();
  const before = await sheetHeight(page, sheet);
  const next = sheet.getByRole('button', { name: 'Далее', exact: true });
  for (let i = 0; i < names.length; i++) {
    await expectStableSheet(page, sheet, async () => {
      await sheet.getByRole('slider').press('End');
      await next.click();
      await expect(sheet.getByText(`${i + 2} из 10`, { exact: true })).toBeVisible();
    });
  }
  for (let i = 0; i < 5; i++) await expectStableSheet(page, sheet, async () => {
    await sheet.getByRole('button', { name: 'Пропустить награду', exact: true }).click();
    await expect(sheet.getByText(`${names.length + i + 2} из 10`, { exact: true })).toBeVisible();
  });
  await expect(sheet.getByRole('heading', { name: 'Матч в целом', exact: true })).toBeVisible();
  await expect(sheet.locator('.review-recap')).toBeVisible();
  expect(Math.abs((await sheetHeight(page, sheet)) - before)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('match awards-only poll keeps its height from the prizes to the summary at 320px', async ({ page }) => {
  await boot(page, 320, (path, method, r) => r.fulfill({ json: path === '/api/me' ? { ...me, userId: 1 } : path === '/api/notifications' ? { tasks: [] } : path.endsWith('/review')
    ? { ...reviewDto, state: 'submitted', canAddAwards: true, ownSubmission: { scores: [{ userId: 10, score: 8 }], gameScore: 8, skipped: false } } : {} }));
  await page.goto('/event/1/review');
  await page.getByRole('button', { name: 'Выбрать лучших', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Лучшие игроки матча' });
  await expect(sheet).toBeVisible();
  for (let i = 0; i < 5; i++) await expectStableSheet(page, sheet, async () => { await sheet.getByRole('button', { name: 'Пропустить награду', exact: true }).click(); await expect(sheet.getByText(`${i + 2} из 6`, { exact: true })).toBeVisible(); });
  await expect(sheet.getByRole('heading', { name: 'Твой выбор' })).toBeVisible();
});
