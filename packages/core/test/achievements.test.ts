import * as core from '../src';
const stats = (p: Partial<core.PlayerStatistics> = {}): core.PlayerStatistics => ({ ...core.aggregatePlayerStatistics([]), ...p });

test('ladders keep the spec order and seven thresholds each', () => {
  const rows = core.playerAchievements(stats());
  expect(rows.map(r => r.id)).toEqual(['scorer','winner','rhythm','veteran','hat-trick','mvp','position-best']);
  expect(rows.find(r => r.id === 'rhythm')!.thresholds).toEqual([5,25,50,100,250,500,1000]);
  expect(rows.every(r => r.thresholds.length === 7)).toBe(true);
});
test('a fresh player has every ladder closed with the first threshold as target', () => {
  const scorer = core.playerAchievements(stats())[0];
  expect(scorer).toMatchObject({ current: 0, level: 0, tier: null, nextTier: 'wood', nextTarget: 1 });
});
test('64 goals is gold heading to platinum at 100', () => {
  expect(core.playerAchievements(stats({ goals: 64 }))[0]).toMatchObject({ level: 4, tier: 'gold', nextTier: 'platinum', nextTarget: 100 });
});
test('reaching a threshold exactly unlocks that tier', () => {
  expect(core.playerAchievements(stats({ meetings: 5 })).find(r => r.id === 'veteran')).toMatchObject({ level: 2, tier: 'bronze', nextTarget: 10 });
});
test('legend has no next target', () => {
  expect(core.playerAchievements(stats({ goals: 900 }))[0]).toMatchObject({ level: 7, tier: 'legend', nextTier: null, nextTarget: null });
});
test('hat-trick ladder reads hatTricks and unlocked levels sum across ladders', () => {
  const rows = core.playerAchievements(stats({ hatTricks: 3, goals: 10 }));
  expect(rows.find(r => r.id === 'hat-trick')).toMatchObject({ level: 2, tier: 'bronze' });
  expect(core.unlockedLevels(rows)).toBe(4);
  expect(core.ACHIEVEMENT_TOTAL_LEVELS).toBe(49);
});
test('isAchievementId rejects unknown values', () => {
  expect(core.isAchievementId('scorer')).toBe(true);
  expect(core.isAchievementId('sniper')).toBe(false);
  expect(core.isAchievementId(null)).toBe(false);
});

test('mvp and position ladders follow their thresholds', () => {
  const rows = core.playerAchievements(core.aggregatePlayerStatistics([], { mvp: 3, forward: 4, midfielder: 0, defender: 0, goalkeeper: 0 }));
  expect(rows.find(r => r.id === 'mvp')).toMatchObject({ current: 3, level: 2, tier: 'bronze', nextTarget: 5, thresholds: [1, 3, 5, 10, 20, 35, 50] });
  expect(rows.find(r => r.id === 'position-best')).toMatchObject({ current: 4, level: 1, tier: 'wood', nextTarget: 5, thresholds: [1, 5, 10, 25, 50, 75, 100] });
});
test('statistics without awards carry zero totals, and new ladders can be pinned', () => {
  expect(core.aggregatePlayerStatistics([])).toMatchObject({ mvps: 0, positionAwards: 0, awards: { mvp: 0, forward: 0, midfielder: 0, defender: 0, goalkeeper: 0 } });
  expect(core.isAchievementId('mvp') && core.isAchievementId('position-best')).toBe(true);
});
