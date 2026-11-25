import AxeBuilder from '@axe-core/playwright';
import { animationsSettled, expect, test, type Page } from './fixtures';
import { teamApiRoute } from './team-fixture';
import { clubById, contrastRatio } from '../../packages/core/src/clubs';

// Синтетические данные: ничего не уходит ни в бота, ни в D1.
const community = { id: 1, title: 'FC Altynka' };
const rating = { value: 5.4, initial: 5, selfAssessment: { teamwork: 3, dribbling: 3, technique: 3, shooting: 3, stamina: 3, physical: 3, passing: 3, defending: 3 }, matchesCount: 2 };
const statistics = { awards: { mvp: 0, forward: 0, midfielder: 0, defender: 0, goalkeeper: 0 }, mvps: 0, positionAwards: 0, meetings: 3, games: 9, goals: 3, assists: 0, wins: 3, draws: 3, losses: 3, winPercentage: 33, bestGoalsInMeeting: 1, hatTricks: 0 };
const names = ['Алихан', 'Ержан', 'Данияр', 'Тимур', 'Асхат', 'Нурлан'];
const event = { id: 7, community, date: '2026-11-12', status: 'scheduled', startTime: '21:00', durationHours: 1, place: 'Школа Аксай', limit: 10, mainCount: 6, reserveCount: 0, my: 'main', myReservePosition: null, comment: null,
  main: names.map((name, i) => ({ id: i + 1, seq: i + 1, userId: i + 1, name, invitedByUserId: null, guestOfName: null, level: 5 })), reserve: [], teams: null, bill: null, viewerRole: 'admin', protocolVersion: 0, serverNow: Date.parse('2026-11-07T10:00:00+05:00') };
const profile = (userId: number, favoriteClub: string | null) => ({ userId, displayName: names[userId - 1], playingPosition: 'universal', dominantFoot: 'both', rating, role: 'player', telegramUsername: 'player', pinnedAchievement: 'scorer', favoriteClub, statistics, history: [], gameHistory: [] });

/** Мок API с изменяемой записью `me`; PATCH сохраняет присланные поля. */
async function world(page: Page, own: { favoriteClub?: string | null; theme?: 'dark' | 'light'; peer?: string | null } = {}) {
  const me = { ...profile(1, own.favoriteClub ?? null), profileCompleted: true, kaspiPhone: '+77071234567', theme: own.theme ?? 'dark', role: 'admin', communities: [{ ...community, role: 'admin' }], telegram: { firstName: 'Алихан', lastName: null, username: 'alikhan', photoUrl: null } };
  if (own.favoriteClub === undefined) delete (me as Partial<typeof me>).favoriteClub;
  const patches: Record<string, unknown>[] = [];
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+05:00'));
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await teamApiRoute(page, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') {
      if (route.request().method() === 'PATCH') { const body = route.request().postDataJSON(); patches.push(body); Object.assign(me, body); }
      return route.fulfill({ json: me });
    }
    if (path === '/api/events') return route.fulfill({ json: { active: [event], past: [] } });
    if (path === '/api/matches') return route.fulfill({ json: { events: [], nextCursor: null } });
    if (path === '/api/notifications') return route.fulfill({ json: { tasks: [{ id: 's7', kind: 'schedule', eventId: 7, community, date: '2026-11-12', place: 'Школа Аксай' }] } });
    if (path === '/api/feed') return route.fulfill({ json: { posts: [{ id: 1, kind: 'winner', text: 'Красные выиграли матч: 3 победы, 1 ничья.', highlights: ['Красные'], createdAt: Date.parse('2026-11-06T15:00:00Z'), eventId: 7, eventDate: '2026-11-06', community, userId: null, teamColor: 'red', player: null, reactions: { fire: 0, good: 0, bad: 0 }, myReaction: null }] } });
    if (path === '/api/members') return route.fulfill({ json: [] });
    if (path === '/api/players') return route.fulfill({ json: { groups: [{ community, role: 'admin', players: names.map((displayName, i) => ({ userId: i + 1, displayName, playingPosition: 'defender', rating: { value: 5 } })) }] } });
    if (/^\/api\/players\/\d+$/.test(path)) return route.fulfill({ json: profile(Number(path.split('/').at(-1)), own.peer ?? null) });
    return route.fulfill({ json: event });
  });
  return patches;
}

const contrast = async (page: Page) => {
  await animationsSettled(page);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  return result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
};

test('picking a club recolours the app and the profile card', async ({ page }) => {
  const patches = await world(page);
  await page.goto('/profile');
  const card = page.getByRole('region', { name: 'Профиль игрока' });
  await expect(card).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-club', /.+/);
  await expect(page.locator('.club-backdrop')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Любимый клуб/ })).toContainText('Не выбран');
  await page.getByRole('link', { name: /Любимый клуб/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Любимый клуб' });
  await expect(sheet.getByText('Список клубов будет пополняться')).toBeVisible();
  await sheet.getByRole('button', { name: 'Барселона' }).click();
  await expect(page.getByRole('dialog', { name: 'Любимый клуб' })).toHaveCount(0);
  expect(patches).toEqual([{ favoriteClub: 'barcelona' }]);
  await expect(page.locator('html')).toHaveAttribute('data-club', 'barcelona');
  await expect(page.locator('.club-backdrop')).toBeVisible();
  await expect(page.locator('.club-heading-crest')).toBeVisible();
  await expect(card).toHaveClass(/club-material/);
  await expect(card.getByRole('img', { name: 'Любимый клуб: Барселона' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Любимый клуб/ })).toContainText('Барселона');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-club', 'barcelona');
});

for (const theme of ['dark', 'light'] as const) for (const club of ['barcelona', 'real-madrid', 'kairat', 'juventus']) {
  test(`club ${club} in the ${theme} theme keeps contrast on Home, Profile and the match`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await world(page, { favoriteClub: club, theme });
    for (const [path, shot] of [['/', 'home'], ['/profile', 'profile'], ['/event/7', 'event']] as const) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-club', club);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.club-backdrop')).toBeVisible();
      // У матча в заголовке есть действия, поэтому маленькой эмблемы там нет.
      if (shot === 'event') await expect(page.locator('.screen-heading .subtitle')).toBeVisible();
      else await expect(page.locator('img.club-heading-crest')).toBeVisible();
      await page.waitForFunction(() => [...document.images].every(i => i.complete));
      expect(await contrast(page), `${path} ${club} ${theme}`).toEqual([]);
      await page.screenshot({ path: `artifacts/ui/club-${shot}-${club}-${theme}.png` });
    }
  });
}

/** `rgb(r, g, b)` из getComputedStyle → `#rrggbb`. */
const hex = (rgb: string) => '#' + rgb.match(/\d+/g)!.slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('');
const over = (top: string, bottom: string, alpha: number) => '#' + [1, 3, 5].map(i => Math.round(parseInt(top.slice(i, i + 2), 16) * alpha + parseInt(bottom.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');

// axe отдаёт текст на градиенте как «incomplete», поэтому контраст подзаголовка на узоре считаем сами из того, что отрисовано.
for (const [club, theme] of [['real-madrid', 'dark'], ['juventus', 'light']] as const) {
  test(`${club} ${theme}: the match heading and its weekday stay readable over the pattern`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await world(page, { favoriteClub: club, theme });
    await page.goto('/event/7');
    const subtitle = page.locator('.screen-heading .subtitle');
    await expect(subtitle).toBeVisible();
    await expect(page.locator('.club-backdrop')).toBeVisible();
    const drawn = await page.evaluate(() => {
      const backdrop = document.querySelector('.club-backdrop')!;
      const heading = document.querySelector('.screen-heading')!;
      return {
        variable: getComputedStyle(document.documentElement).getPropertyValue('--club-pattern-opacity').trim(),
        opacity: getComputedStyle(backdrop, '::before').opacity,
        bg: getComputedStyle(document.documentElement).backgroundColor,
        title: getComputedStyle(heading.querySelector('.title')!).color,
        subtitle: getComputedStyle(heading.querySelector('.subtitle')!).color,
        // Подзаголовок лежит на шапке, у верхней немаскированной части, где узор в полную силу: считаем худший случай.
        subtitleTop: heading.querySelector('.subtitle')!.getBoundingClientRect().top - backdrop.getBoundingClientRect().top,
        solidUntil: backdrop.getBoundingClientRect().height * 0.25,
      };
    });
    const alpha = Number(drawn.opacity);
    expect(drawn.variable).toBe(drawn.opacity);
    expect(alpha).toBeLessThan(theme === 'dark' ? 0.55 : 0.3);
    expect(alpha).toBeGreaterThan(0);
    expect(drawn.subtitleTop).toBeLessThan(drawn.solidUntil);
    for (const color of clubById(club)!.pattern.colors) {
      const mixed = over(color, hex(drawn.bg), alpha);
      expect(contrastRatio(hex(drawn.subtitle), mixed), `subtitle on ${color}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(hex(drawn.title), mixed), `title on ${color}`).toBeGreaterThanOrEqual(4.5);
    }
  });
}

test('high contrast hides the backdrop and keeps only the club colour on a flat primary button', async ({ page }) => {
  await page.emulateMedia({ contrast: 'more' });
  await world(page, { favoriteClub: 'barcelona' });
  await page.goto('/profile');
  await expect(page.locator('html')).toHaveAttribute('data-club', 'barcelona');
  await expect(page.locator('.club-backdrop')).toBeHidden();
  const style = await page.evaluate(() => {
    const host = document.querySelector('.screen')!;
    const button = Object.assign(document.createElement('button'), { className: 'btn primary', textContent: 'Проверка' });
    host.append(button);
    const s = getComputedStyle(button);
    const result = { bg: s.backgroundColor, image: s.backgroundImage, color: s.color, shadow: s.boxShadow };
    button.remove();
    return result;
  });
  const barcelona = clubById('barcelona')!.dark;
  expect(hex(style.bg)).toBe(barcelona.accent);
  expect(hex(style.color)).toBe(barcelona.onAccent);
  expect(style.image).toBe('none');
  expect(style.shadow).toBe('none');
});

for (const width of [390, 320]) test(`${width} px: picker with long names has no sideways scroll`, async ({ page }) => {
  await page.setViewportSize({ width, height: 700 });
  await world(page, { favoriteClub: 'barcelona' });
  await page.goto('/profile/club');
  const sheet = page.getByRole('dialog', { name: 'Любимый клуб' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('tab', { name: 'Клубы' })).toHaveAttribute('aria-selected', 'true');
  await sheet.getByRole('button', { name: 'Все', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Боруссия Дортмунд' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Манчестер Юнайтед' })).toBeVisible();
  await animationsSettled(page);
  await page.screenshot({ path: `artifacts/ui/club-picker-all-${width}.png` });
  await sheet.getByRole('button', { name: 'Бундеслига', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Бавария' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Барселона' })).toHaveCount(0);
  for (const tile of await sheet.locator('.club-tile').all()) {
    const box = (await tile.boundingBox())!, parent = (await sheet.locator('.club-grid').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(parent.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(parent.x + parent.width + 1);
  }
  await page.screenshot({ path: `artifacts/ui/club-picker-bundesliga-${width}.png` });
  await sheet.getByRole('tab', { name: 'Сборные' }).click();
  await expect(sheet.getByRole('button', { name: 'Бразилия' })).toBeVisible();
  await expect(sheet.locator('.club-leagues')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("peer profile shows the owner's club", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await world(page, { favoriteClub: 'real-madrid', peer: 'barcelona' });
  await page.goto('/players/2');
  const dialog = page.getByRole('dialog', { name: 'Профиль игрока' });
  const card = dialog.locator('.player-sports-card');
  await expect(card).toHaveClass(/club-material/);
  await expect(card.getByRole('img', { name: 'Любимый клуб: Барселона' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-club', 'real-madrid');
  await animationsSettled(page);
  await page.screenshot({ path: 'artifacts/ui/club-peer-profile.png' });
});

test('a peer without a club keeps the plum card', async ({ page }) => {
  await world(page, { favoriteClub: 'real-madrid', peer: null });
  await page.goto('/players/2');
  const card = page.getByRole('dialog', { name: 'Профиль игрока' }).locator('.player-sports-card');
  await expect(card).toHaveClass(/material-plum/);
  await expect(card).not.toHaveClass(/club-material/);
});

test('no club looks as before', async ({ page }) => {
  await world(page);
  await page.goto('/profile');
  const card = page.getByRole('region', { name: 'Профиль игрока' });
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/material-plum/);
  await expect(page.locator('.club-backdrop')).toHaveCount(0);
  await expect(page.locator('.club-heading-crest')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-club', /.+/);
  expect(await contrast(page)).toEqual([]);
});

test('an unknown club id is treated as no club', async ({ page }) => {
  await world(page, { favoriteClub: 'atlantis' });
  await page.goto('/profile');
  await expect(page.getByRole('region', { name: 'Профиль игрока' })).toHaveClass(/material-plum/);
  await expect(page.locator('.club-backdrop')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Любимый клуб/ })).toContainText('Не выбран');
});
