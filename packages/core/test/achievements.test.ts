import * as core from '../src';
const stats = (p: Partial<core.PlayerStatistics> = {}): core.PlayerStatistics => ({ ...core.aggregatePlayerStatistics([]), ...p });

test('ladders keep the spec order and seven thresholds each', () => {
  const rows = core.playerAchievements(stats());
  expect(rows.map(r => r.id)).toEqual(['scorer','winner','rhythm','veteran','hat-trick']);
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
  expect(core.ACHIEVEMENT_TOTAL_LEVELS).toBe(35);
});
test('isAchievementId rejects unknown values', () => {
  expect(core.isAchievementId('scorer')).toBe(true);
  expect(core.isAchievementId('sniper')).toBe(false);
  expect(core.isAchievementId(null)).toBe(false);
});
