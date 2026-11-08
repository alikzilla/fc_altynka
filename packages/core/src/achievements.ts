import type { PlayerStatistics } from './playerStatistics';

export const ACHIEVEMENT_IDS = ['scorer', 'winner', 'rhythm', 'veteran', 'hat-trick'] as const;
export type AchievementId = typeof ACHIEVEMENT_IDS[number];
export const ACHIEVEMENT_TIERS = ['wood', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'legend'] as const;
export type AchievementTier = typeof ACHIEVEMENT_TIERS[number];
export const ACHIEVEMENT_TIER_LABEL: Record<AchievementTier, string> = {
  wood: 'Дерево', bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', platinum: 'Платина', diamond: 'Алмаз', legend: 'Легенда',
};
export const ACHIEVEMENT_TIER_TO: Record<AchievementTier, string> = {
  wood: 'До дерева', bronze: 'До бронзы', silver: 'До серебра', gold: 'До золота', platinum: 'До платины', diamond: 'До алмаза', legend: 'До легенды',
};
export const ACHIEVEMENT_TOTAL_LEVELS = ACHIEVEMENT_IDS.length * ACHIEVEMENT_TIERS.length;
export type AchievementSymbol = 'ball' | 'trophy' | 'shirt' | 'shield' | 'flame';

export interface PlayerAchievement {
  id: AchievementId; title: string; metric: string; unit: readonly [string, string, string];
  symbol: AchievementSymbol; current: number; thresholds: readonly number[];
  /** 0..7, 0 — ещё не открыто. */
  level: number;
  tier: AchievementTier | null;
  nextTier: AchievementTier | null;
  nextTarget: number | null;
}

const LADDERS: readonly { id: AchievementId; title: string; metric: string; unit: readonly [string, string, string]; symbol: AchievementSymbol; stat: keyof PlayerStatistics; thresholds: readonly number[] }[] = [
  { id: 'scorer', title: 'Бомбардир', metric: 'Голы за всё время', unit: ['гол', 'гола', 'голов'], symbol: 'ball', stat: 'goals', thresholds: [1, 10, 25, 50, 100, 250, 500] },
  { id: 'winner', title: 'Победитель', metric: 'Победы в коротких играх', unit: ['победа', 'победы', 'побед'], symbol: 'trophy', stat: 'wins', thresholds: [1, 10, 25, 50, 100, 250, 500] },
  { id: 'rhythm', title: 'В ритме игры', metric: 'Сыгранные короткие игры', unit: ['игра', 'игры', 'игр'], symbol: 'shirt', stat: 'games', thresholds: [5, 25, 50, 100, 250, 500, 1000] },
  { id: 'veteran', title: 'Ветеран', metric: 'Сыгранные встречи', unit: ['встреча', 'встречи', 'встреч'], symbol: 'shield', stat: 'meetings', thresholds: [1, 5, 10, 25, 50, 100, 200] },
  { id: 'hat-trick', title: 'Хет-трик', metric: 'Встречи с 3+ голами', unit: ['хет-трик', 'хет-трика', 'хет-триков'], symbol: 'flame', stat: 'hatTricks', thresholds: [1, 3, 5, 10, 20, 35, 50] },
];

export function playerAchievements(stats: PlayerStatistics): PlayerAchievement[] {
  return LADDERS.map(({ stat, ...ladder }) => {
    const current = Number(stats[stat] ?? 0);
    const level = ladder.thresholds.filter(target => current >= target).length;
    return { ...ladder, current, level,
      tier: level ? ACHIEVEMENT_TIERS[level - 1] : null,
      nextTier: ACHIEVEMENT_TIERS[level] ?? null,
      nextTarget: ladder.thresholds[level] ?? null };
  });
}

export const isAchievementId = (value: unknown): value is AchievementId =>
  typeof value === 'string' && (ACHIEVEMENT_IDS as readonly string[]).includes(value);

export const unlockedLevels = (rows: readonly PlayerAchievement[]): number => rows.reduce((sum, row) => sum + row.level, 0);
