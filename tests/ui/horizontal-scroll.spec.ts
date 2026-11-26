import type { Locator, Page } from '@playwright/test';
import { aggregatePlayerStatistics } from '../../packages/core/src/playerStatistics';
import { expect, test } from './fixtures';
import { gameStatisticsWorld } from './game-statistics-fixture';

/**
 * Worst case for width: a 320px phone, names and titles without a single space, the largest amounts.
 * The shared fixture fails the test as soon as the page or any sheet can scroll sideways; each step
 * here only has to open the screen or the sheet. Synthetic data; nothing reaches the bot or D1.
 */
const LONG = 'АлександрКонстантинопольский';
const name = (i: number) => `${LONG}${i}`;
const group = { id: 1, title: 'ФутболПоСубботамВШколеАксайИДрузьяКоманды' };
const other = { id: 2, title: 'ВтораяГруппаСОченьДлиннымНазваниемБезПробелов' };
const place = 'КрытыйМанежСОченьДлиннымНазваниемПлощадки · УлицаДлиннаяулицаБезПробелов150';
const phone = '+77071234567';
const at = (iso: string) => Date.parse(iso);
const now = at('2026-11-08T10:00:00+05:00');

const signup = (i: number, patch: object = {}) => ({ id: i, seq: i, name: name(i), userId: i, photoUrl: null, guestOfName: null, invitedByUserId: null, level: 5, kaspiPhone: phone, ...patch });
const main = [signup(1), ...Array.from({ length: 8 }, (_, i) => signup(i + 2)), signup(10, { userId: null, guestOfName: name(1), invitedByUserId: 1 })];
const reserve = [signup(11), signup(12, { userId: null, guestOfName: name(2), invitedByUserId: 2 })];
const base = { community: group, viewerRole: 'admin', date: '2026-11-08', startTime: '21:00', durationHours: 2, place, limit: 10, mainCount: main.length, reserveCount: reserve.length, my: 'main', myReservePosition: null, serverNow: now,
  comment: `Берём${'ОченьДлинныйКомментарийБезПробелов'.repeat(3)}`, main, reserve, teams: null, bill: null };
const teams = { teamCount: 2, teams: [main.slice(0, 5).map(s => s.id), main.slice(5).map(s => s.id)], publishedAt: now, stale: false, colors: ['red', 'blue'], colorsRevision: 0 };
const lines = main.filter(s => s.userId !== null).map((s, i) => ({ id: 100 + i, userId: s.userId, name: s.name, units: i === 1 ? 2 : 1, amount: i === 1 ? 1_999_998 : 999_999, paidAmount: i === 2 ? 999_999 : i === 3 ? 500_000 : null, state: i === 2 ? 'paid' : i === 3 ? 'underpaid' : 'unpaid', due: i === 2 ? 0 : i === 3 ? 499_999 : 999_999 }));
const bill = { id: 7, receiver: { userId: 1, name: name(1), kaspiPhone: phone }, fieldAmount: 9_999_999, extras: [{ label: 'ВодаИМанишкиИЕщёЧтоТоОченьДлинное', amount: 9_999_999 }], total: 19_999_998, share: 999_999, status: 'open', participantSignupIds: main.map(s => s.id), lines };
const events: Record<number, object> = {
  1: { ...base, id: 1, status: 'collecting', startTime: null, durationHours: null },
  2: { ...base, id: 2, status: 'scheduled', teams },
  3: { ...base, id: 3, status: 'billing', teams, bill },
  4: { ...base, id: 4, status: 'closed', teams, bill: { ...bill, status: 'closed', lines: lines.map(l => ({ ...l, paidAmount: l.amount, state: 'paid', due: 0 })) },
    review: { state: 'open', canFinish: false, completedAt: now, closesAt: now + 72 * 3600000, gameScore: null } },
};
const summary = (id: number) => { const { main: _m, reserve: _r, teams: _t, bill: _b, comment: _c, ...rest } = events[id] as Record<string, unknown>; return rest; };
const statistics = { ...aggregatePlayerStatistics([]), meetings: 999, games: 9999, goals: 999, assists: 999, wins: 999, draws: 99, losses: 99, winPercentage: 100, bestGoalsInMeeting: 99, hatTricks: 99 };
const player = (i: number) => ({ userId: i, displayName: name(i), photoUrl: null, playingPosition: 'midfielder', dominantFoot: 'right', rating: { value: 9.9, initial: 5, selfAssessment: null, matchesCount: 99 }, injured: i === 3 });
const profile = (i: number) => ({ ...player(i), telegramUsername: `user${'_long'.repeat(8)}`, role: 'organizer', statistics, gameHistory: [], pinnedAchievement: 'scorer',
  history: [3, 4].map(id => ({ eventId: id, date: '2026-11-01', place, score: 9.9, community: group, protocolVersion: 1 })) });
const post = (id: number, kind: string, text: string, patch: object = {}) => ({ id, kind, text, highlights: [LONG], createdAt: now - 3600000, eventId: 4, eventDate: '2026-11-08', community: group, userId: null, teamColor: null, player: null, reactions: { fire: 999, good: 999, bad: 999 }, myReaction: 'fire', ...patch });
const day = (offset: number) => new Date(now + offset * 86_400_000).toISOString().slice(0, 10);
const review = { state: 'open', canFinish: false, canClose: true, completedAt: now, closesAt: now + 72 * 3600000, serverNow: now, gameScore: null, ownSubmission: null, awards: null,
  participants: main.filter(s => s.userId !== null).map(s => ({ userId: s.userId, name: s.name, photoUrl: null, score: null, voted: s.id % 2 === 0, stats: { games: 99, goals: 99, assists: 99, wins: 99, draws: 9, losses: 9, assistsTracked: true } })) };

function me(role: 'admin' | 'player') {
  return { userId: 1, displayName: name(1), kaspiPhone: phone, profileCompleted: true, playingPosition: 'midfielder', dominantFoot: 'right', pinnedAchievement: 'scorer', theme: 'dark',
    notifications: { enabled: true, available: false }, rating: { value: 9.9, initial: 5, matchesCount: 99, selfAssessment: { teamwork: 7, dribbling: 6, technique: 7, shooting: 5, stamina: 7, physical: 6, passing: 8, defending: 6 } },
    communities: [{ ...group, role }, { ...other, role: 'player' }], telegram: { firstName: LONG, lastName: LONG, username: `user${'_long'.repeat(8)}`, photoUrl: null } };
}

async function longWorld(page: Page, role: 'admin' | 'player') {
  await page.clock.setFixedTime(new Date(now));
  await page.route('https://telegram.org/**', r => r.fulfill({ body: '' }));
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()), path = url.pathname, method = route.request().method();
    const json = (body: unknown) => route.fulfill({ json: body });
    if (method !== 'GET') return json({ kind: 'ok' });
    if (path === '/api/me') return json(me(role));
    if (path === '/api/events') return json({ active: [summary(1), summary(2), summary(3)], past: [summary(4)] });
    if (path === '/api/matches') return json({ events: [summary(4), { ...summary(4), id: 5, community: other }], nextCursor: null });
    if (path === '/api/notifications') return json({ tasks: [
      { kind: 'payment', id: 'payment:3', community: group, eventId: 3, billId: 7, date: '2026-11-08', place, due: 9_999_999, receiverName: name(1), receiverKaspiPhone: phone },
      { kind: 'payment', id: 'payment:9', community: { id: 9, title: 'ПокинутаяГруппаСДлиннымНазванием' }, eventId: 9, billId: 9, date: '2026-11-01', place, due: 9_999_999, receiverName: name(2), receiverKaspiPhone: phone },
      { kind: 'review', id: 'review:4', community: group, eventId: 4, date: '2026-11-08', place, closesAt: now + 72 * 3600000 },
      { kind: 'schedule', id: 'schedule:1', community: group, eventId: 1, date: '2026-11-08', place },
      { kind: 'skills', id: 'skills' },
    ] });
    if (path === '/api/feed') return json({ posts: [
      post(1, 'winner', `${LONG} не оставили шансов: 99 побед из 99.`, { teamColor: 'red' }),
      post(2, 'hero', `${LONG} — герой матча: 99 голов и 99 передач.`, { userId: 2, player: { userId: 2, name: name(2), photoUrl: null } }),
      post(3, 'summary', `Матч в цифрах: 999 игр, 9999 голов, ${LONG}.`),
      post(5, 'ceremony', `Награды матча вручены. MVP — ${name(2)}.`, { userId: 2, player: { userId: 2, name: name(2), photoUrl: null }, ceremony: [
        { award: 'mvp', userId: 2, name: name(2), photoUrl: null, title: 'Главный герой вечера', text: `${name(2)} забирает главный приз вечера. 999 голосов, и все заслуженные.`, votes: 999, stats: { goals: 999, assists: 999, games: 999, wins: 999 }, sharedWith: [3] },
        { award: 'mvp', userId: 3, name: name(3), photoUrl: null, title: 'Человек матча', text: `Лучший игрок вечера: ${name(3)}.`, votes: 999, stats: null, sharedWith: [2] },
      ] }),
    ] });
    if (path === '/api/players') return json({ groups: [{ community: group, role, players: [1, 2, 3, 4].map(player) }, { community: other, role: 'player', players: [1, 5].map(player) }] });
    if (/^\/api\/players\/\d+$/.test(path)) return json(profile(Number(path.split('/').at(-1))));
    if (path === '/api/members') return json([1, 2, 3, 4].map(i => ({ userId: i, displayName: name(i), role: i === 1 ? 'admin' : 'player', level: 5, injured: i === 3 })));
    if (path === '/api/venues') return json({ venues: [{ id: 1, name: place, address: 'УлицаДлиннаяулицаБезПробелов150КорпусДлинный', mapUrl: 'https://go.2gis.com/abc', hourlyRate: 10_000_000 }, { id: 2, name: `${LONG}Арена`, address: null, mapUrl: null, hourlyRate: null }] });
    if (path === '/api/availability') return json({ markedThisWeek: true, days: Array.from({ length: 7 }, (_, i) => ({ date: day(i), past: false, mark: i === 1 ? { status: 'yes', parts: ['morning', 'noon', 'afternoon', 'evening', 'night'] } : null })) });
    if (path === '/api/statistics') return json({ groups: [group, other].map(community => ({ community, players: [1, 2, 3, 4, 5].map(i => ({ userId: i, displayName: name(i), photoUrl: null, rating: 9.9, meetings: 999, games: 9999, goals: 999 - i, assists: 999 - i, assistsTracked: true, wins: 999 })) })) });
    if (/^\/api\/events\/\d+\/review$/.test(path)) return json(review);
    if (/^\/api\/bills\/\d+\/reminder-status$/.test(path)) return json({ report: null });
    const id = Number(path.split('/')[3]);
    if (/^\/api\/events\/\d+$/.test(path) && events[id]) return json({ ...events[id], viewerRole: role });
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
}

/** Opens a screen and waits until it has content, not a skeleton. */
async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('.skeleton-layout')).toHaveCount(0);
}
async function sheet(page: Page, open: Locator, name: string | RegExp) {
  await open.click();
  const dialog = page.getByRole('dialog', { name }).last();
  await expect(dialog).toBeVisible();
  return dialog;
}
/** Closes the top sheet; a screen that is itself a sheet (schedule) stays open under it. */
async function close(page: Page) {
  const open = await page.locator('dialog[open]').count();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(open - 1);
}

test.use({ viewport: { width: 320, height: 640 } });
test.describe.configure({ timeout: 120_000 });

test('player screens and their sheets never scroll sideways with long names at 320px', async ({ page }) => {
  await longWorld(page, 'player');
  await visit(page, '/');
  await expect(page.getByRole('heading', { name: 'Лента' })).toBeVisible();
  await sheet(page, page.getByRole('button', { name: /герой матча/ }), 'Профиль игрока');
  await close(page);
  for (const path of ['/matches', '/matches?view=past', '/notifications', '/profile', '/profile/settings/name', '/profile/settings/payment', '/profile/settings/football', '/players', '/players/2', '/stats', '/venues', '/event/2', '/event/2?tab=teams', '/event/3?tab=bill', '/event/4?tab=bill', '/event/4/review'])
    await visit(page, path);
  await visit(page, '/profile/availability');
  await expect(page.getByRole('dialog', { name: 'Когда могу играть' })).toBeVisible();
  // Шторка клуба: сетка плиток и вкладка сборных на 320 px; ряд лиг прокручивается намеренно.
  await visit(page, '/profile/club');
  const clubs = page.getByRole('dialog', { name: 'Любимый клуб' });
  await expect(clubs.getByRole('button', { name: 'Боруссия Дортмунд' })).toBeVisible();
  await clubs.getByRole('tab', { name: 'Сборные' }).click();
  await expect(clubs.getByRole('button', { name: 'Казахстан' })).toBeVisible();
  await visit(page, '/event/2');
  await sheet(page, page.getByRole('button', { name: 'Изменить', exact: true }), 'Твоё участие');
  await close(page);
  await sheet(page, page.getByRole('button', { name: 'Добавить друга' }), 'Привести друга');
  await close(page);
});

test('organizer screens and their sheets never scroll sideways with long names at 320px', async ({ page }) => {
  await longWorld(page, 'admin');
  for (const path of ['/', '/new', '/event/1', '/event/1/schedule', '/event/2?tab=teams', '/event/3?tab=bill', '/players', '/venues'])
    await visit(page, path);
  await visit(page, '/event/1');
  await sheet(page, page.getByRole('button', { name: `Действия: ${name(2)}` }), name(2));
  await close(page);
  await sheet(page, page.getByRole('button', { name: 'Действия матча' }), 'Действия матча');
  await close(page);
  await visit(page, '/event/1/schedule');
  const venue = page.getByRole('button', { name: /площадк|Место/i }).first();
  if (await venue.count()) { await sheet(page, venue, 'Место проведения'); await close(page); }
  await visit(page, '/event/3?tab=bill');
  const edit = await sheet(page, page.getByRole('button', { name: 'Изменить', exact: true }), 'Изменить счёт');
  await edit.getByRole('button', { name: '+ Расход' }).click();
  await close(page);
  await visit(page, '/players');
  await page.getByRole('button', { name: `Управление: ${name(2)}` }).first().click();
  await expect(page.getByRole('button', { name: 'Отметить травму' })).toBeVisible();
  await visit(page, '/venues');
  await sheet(page, page.getByRole('button', { name: `Изменить площадку ${place}` }), 'Площадка');
  await close(page);
});

test('the game protocol and its sheets never scroll sideways with long names at 320px', async ({ page }) => {
  const world = gameStatisticsWorld({ count: 3 });
  for (let i = 0; i < 6; i++) world.makeGuest(i, name(i + 1), i % 2 ? 'Али' : name(9));
  world.start();
  world.add({ score: [9, 8], scorers: [] });
  await world.attach(page);
  await visit(page, '/event/7?tab=games');
  await visit(page, '/event/7/game');
  await sheet(page, page.getByRole('button', { name: 'Действия', exact: true }), 'Протокол матча');
  await close(page);
  const result = await sheet(page, page.getByRole('button', { name: 'Внести результат', exact: true }), 'Результат игры');
  for (const side of [0, 1]) await result.locator('.game-score-side').nth(side).getByRole('button', { name: /Добавить гол команды/ }).click();
  await close(page);
  await visit(page, '/event/7?tab=teams');
  const kit = page.getByRole('button', { name: /Изменить цвет:/ }).first();
  if (await kit.count()) { await sheet(page, kit, /Цвет|Форма/); await close(page); }
});

test('the game screen of a participant never scrolls sideways at 320px', async ({ page }) => {
  const world = gameStatisticsWorld({ count: 3 });
  for (let i = 0; i < 6; i++) world.makeGuest(i, name(i + 1), i % 2 ? 'Али' : name(9));
  world.start();
  world.setTimer({ gameSequence: 1, durationSec: 360, startedAt: Date.now() - 1000, pausedAt: null, pausedMs: 0, updatedAt: Date.now() - 1000 });
  await world.attach(page, { manage: false, userId: 2 });
  await visit(page, '/event/7/game');
  await expect(page.getByRole('timer')).toBeVisible();
});
