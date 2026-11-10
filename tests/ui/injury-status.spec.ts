import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Synthetic data only: no bot, D1 or real group.
const community = { id: 1, title: 'FC Altynka' };
const rating = { value: 5, initial: 5, selfAssessment: null, matchesCount: 0 };
const statistics = { meetings: 0, games: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, winPercentage: 0, bestGoalsInMeeting: 0, hatTricks: 0 };
const people = [{ userId: 1, displayName: 'Алихан Нуспеков' }, { userId: 2, displayName: 'Арман Пак', injured: true }, { userId: 3, displayName: 'Олжас Пак' }];
const players = people.map(p => ({ ...p, playingPosition: null, dominantFoot: null, rating, injured: !!p.injured }));
const profile = (id: number) => ({ ...players.find(p => p.userId === id)!, role: 'player', telegramUsername: null, pinnedAchievement: null, statistics, history: [], gameHistory: [] });

async function mock(page: Page, theme: string) {
  const patches: unknown[] = [];
  await page.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') { patches.push(route.request().postDataJSON()); return route.fulfill({ json: {} }); }
    const path = url.pathname;
    const body = path === '/api/me' ? { userId: 1, displayName: 'Алихан Нуспеков', kaspiPhone: null, profileCompleted: true, theme, rating: { ...rating, selfAssessment: { teamwork: 5, dribbling: 5, technique: 5, shooting: 5, stamina: 5, physical: 5, passing: 5, defending: 5 } }, communities: [{ ...community, role: 'admin' }], telegram: { firstName: 'Алихан', lastName: 'Нуспеков', username: null, photoUrl: null } }
      : path === '/api/notifications' ? { tasks: [] }
      : path === '/api/players' ? { groups: [{ community, role: 'admin', players }] }
      : path === '/api/members' ? people.map(p => ({ userId: p.userId, displayName: p.displayName, role: p.userId === 1 ? 'admin' : 'player', level: 5, injured: !!p.injured }))
      : path.startsWith('/api/players/') ? profile(Number(path.split('/').at(-1)))
      : {};
    return route.fulfill({ json: body });
  });
  return patches;
}

for (const theme of ['dark', 'light']) test(`injured player carries the red cross in the list and on the profile (${theme})`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const patches = await mock(page, theme);
  await page.goto('/players');
  const injuredRow = page.locator('.player-directory li', { hasText: 'Арман Пак' });
  const badge = injuredRow.getByTestId('injury-badge');
  await expect(badge).toBeVisible();
  await expect(page.getByTestId('injury-badge')).toHaveCount(1);
  // Top-left corner of the avatar, slightly outside it.
  const [avatar, cross] = await Promise.all([injuredRow.locator('.avatar').boundingBox(), badge.boundingBox()]);
  expect(cross!.x).toBeLessThan(avatar!.x);
  expect(cross!.y).toBeLessThan(avatar!.y);
  expect(cross!.x + cross!.width).toBeLessThan(avatar!.x + avatar!.width / 2);
  expect(await badge.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.screenshot({ path: `artifacts/ui/injury-players-${theme}.png` });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await injuredRow.getByRole('button', { name: 'Управление: Арман Пак' }).click();
  await injuredRow.getByRole('button', { name: 'Снять травму' }).click();
  expect(patches).toContainEqual({ injured: false });

  await page.goto('/players/2');
  const card = page.getByRole('region', { name: 'Профиль игрока' });
  await expect(card.getByTestId('injury-badge')).toBeVisible();
  await page.screenshot({ path: `artifacts/ui/injury-profile-${theme}.png` });
});
