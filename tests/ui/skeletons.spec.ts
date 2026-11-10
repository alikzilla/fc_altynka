import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Скелет повторяет загруженный экран: каждая карточка стоит там же и той же высоты, поэтому
// замена на данные ничего не сдвигает. Фикстуры — синтетические, только для проверки разметки.
const community = { id: 1, title: 'FC Altynka' };
const rating = { value: 5.4, initial: 5, selfAssessment: { teamwork: 3, dribbling: 3, technique: 3, shooting: 3, stamina: 3, physical: 3, passing: 3, defending: 3 }, matchesCount: 2 };
const statistics = { meetings: 3, games: 9, goals: 3, assists: 0, wins: 3, draws: 3, losses: 3, winPercentage: 33, bestGoalsInMeeting: 1, hatTricks: 0 };
const meeting = (day: number) => ({ eventId: day, date: `2026-10-${day}`, place: null, community, colors: ['red', 'blue', 'yellow'], games: 3, goals: 1, wins: 1, draws: 1, losses: 1, score: null,
  results: ['win', 'draw', 'loss'].map((outcome, index) => ({ id: `g${day}${index}`, sequence: index + 1, pair: [0, 1], score: [1, 0], goals: 0, outcome })) });
const profile = { userId: 1, displayName: 'Алихан', playingPosition: 'universal', dominantFoot: 'both', rating, role: 'admin', telegramUsername: 'alikhan', pinnedAchievement: 'scorer', statistics, history: [], gameHistory: [30, 23, 16].map(meeting) };
const names = ['Алихан', 'Ержан', 'Данияр', 'Тимур', 'Асхат', 'Нурлан'];
const event = { id: 7, community, date: '2026-11-12', status: 'scheduled', startTime: '21:00', durationHours: 1, place: 'Школа Аксай', limit: 10, mainCount: 6, reserveCount: 0, my: 'main', myReservePosition: null, comment: null,
  main: names.map((name, i) => ({ id: i + 1, seq: i + 1, userId: i + 1, name, invitedByUserId: null, guestOfName: null, level: 5 })), reserve: [], teams: null, bill: null, viewerRole: 'admin', protocolVersion: 0, serverNow: Date.parse('2026-11-07T10:00:00+05:00') };
const me = { ...profile, profileCompleted: true, kaspiPhone: '+77071234567', communities: [{ ...community, role: 'admin' }], telegram: { firstName: 'Алихан', lastName: null, username: 'alikhan', photoUrl: null } };
const task = { id: 's7', kind: 'schedule', eventId: 7, community, date: '2026-11-12', place: 'Школа Аксай' };

function body(path: string, theme: string) {
  if (path === '/api/me') return { ...me, theme };
  if (path === '/api/events') return { active: [event], past: [] };
  if (path === '/api/matches') return { events: [31, 24].map(day => ({ ...event, id: day, status: 'closed', date: `2026-10-${day}` })), nextCursor: null };
  if (path === '/api/notifications') return { tasks: [task, { ...task, id: 's8', eventId: 8 }] };
  if (path === '/api/players') return { groups: [{ community, role: 'admin', players: names.map((displayName, i) => ({ userId: i + 1, displayName, playingPosition: 'defender', rating: { value: 5 } })) }] };
  if (path === '/api/feed') return { posts: [1, 2, 3].map(id => ({ id, kind: 'winner', text: 'Красные выиграли матч: 3 победы, 1 ничья.', highlights: ['Красные'], createdAt: Date.parse('2026-11-06T15:00:00Z'), eventId: 7, eventDate: '2026-11-06', community, userId: null, teamColor: 'red', player: null, reactions: { fire: 0, good: 0, bad: 0 }, myReaction: null })) };
  if (path === '/api/members') return [];
  if (/^\/api\/players\/\d+$/.test(path)) return profile;
  return event;
}

const cases: [string, 'main' | 'dialog', string[]][] = [
  ['/', 'main', ['.match-card', '.task-preview', '.feed-post']],
  ['/matches?view=past', 'main', ['.archive-month > h2', '.event-row']],
  ['/notifications', 'main', ['.task-card']],
  ['/players', 'main', ['.player-directory-row']],
  ['/players/2', 'dialog', ['.player-sports-card', '.achievements-card', '.player-meeting-history', '.player-meeting-row']],
  ['/profile', 'main', ['.achievements-card', '.player-meeting-history', '.player-meeting-row']],
  ['/event/7', 'main', ['.event-summary', '.tabs', '.match-list-heading', '.person']],
];

/** Top and height of the first skeleton or loaded element for each selector. */
function boxes(page: Page, scope: string, selectors: string[], skeleton: boolean) {
  return page.evaluate(({ scope, selectors, skeleton }) => selectors.map(selector => {
    const root = document.querySelector(scope === 'dialog' ? 'dialog[open]' : 'main');
    const element = [...root?.querySelectorAll(selector) ?? []].find(el => !!el.closest('.loading') === skeleton);
    const box = element?.getBoundingClientRect();
    return box ? { selector, y: box.y, height: box.height } : { selector, y: -1, height: -1 };
  }), { scope, selectors, skeleton });
}

for (const [theme, width] of [['dark', 390], ['dark', 320], ['light', 390]] as const) {
  test(`skeletons keep the loaded geometry: ${theme} ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+05:00'));
    await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
    for (const [path, scope, selectors] of cases) {
      let release = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.unroute('**/api/**');
      await page.route('**/api/**', async route => {
        const resource = new URL(route.request().url()).pathname;
        if (resource !== '/api/me') await gate;
        await route.fulfill({ json: body(resource, theme) });
      });
      await page.goto(path);
      const status = scope === 'dialog' ? page.getByRole('dialog').getByRole('status', { name: 'Загрузка…' }) : page.locator('main').getByRole('status', { name: 'Загрузка…' }).first();
      await expect(status).toBeVisible();
      // The dock appears with the account; then wait for every placeholder of the screen itself.
      await expect(page.locator('.nav')).toBeVisible();
      await expect.poll(async () => (await boxes(page, scope, selectors, true)).every(box => box.y >= 0)).toBe(true);
      // Wait for the sheet to finish sliding in before measuring it.
      if (scope === 'dialog') await expect.poll(async () => Math.round((await page.locator('dialog[open]').boundingBox())!.y + (await page.locator('dialog[open]').boundingBox())!.height)).toBe(844);
      const skeleton = await boxes(page, scope, selectors, true);
      if (theme === 'dark' && width === 390 && path === '/event/7') expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      release();
      await expect(page.locator('.loading')).toHaveCount(0);
      if (scope === 'dialog') await expect.poll(async () => Math.round((await page.locator('dialog[open]').boundingBox())!.y + (await page.locator('dialog[open]').boundingBox())!.height)).toBe(844);
      const loaded = await boxes(page, scope, selectors, false);
      for (const [index, box] of skeleton.entries()) {
        expect(box.y, `${path} ${box.selector} top`).toBeGreaterThanOrEqual(0);
        expect(Math.abs(box.y - loaded[index].y), `${path} ${box.selector} top`).toBeLessThan(1);
        expect(Math.abs(box.height - loaded[index].height), `${path} ${box.selector} height`).toBeLessThan(1);
      }
    }
  });
}
