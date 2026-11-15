/** Награды матча: порядок здесь — порядок шагов опроса, строк итогов и ключей в сохранённом ответе. */
export const AWARDS = ['mvp', 'forward', 'midfielder', 'defender', 'goalkeeper'] as const;
export type AwardKey = typeof AWARDS[number];
/** Столько голосов нужно лидеру, чтобы награда была присуждена. */
export const MIN_AWARD_VOTES = 2;

export const AWARD_LABEL: Record<AwardKey, string> = {
  mvp: 'MVP матча', forward: 'Лучший нападающий', midfielder: 'Лучший полузащитник', defender: 'Лучший защитник', goalkeeper: 'Лучший вратарь',
};
export const AWARD_SHORT_LABEL: Record<AwardKey, string> = {
  mvp: 'MVP матча', forward: 'Нападающий', midfielder: 'Полузащитник', defender: 'Защитник', goalkeeper: 'Вратарь',
};
export const AWARD_QUESTION: Record<AwardKey, string> = {
  mvp: 'Кто был лучшим игроком матча?',
  forward: 'Кто опаснее всех играл в атаке?',
  midfielder: 'Кто лучше всех вёл игру в центре?',
  defender: 'Кто лучше всех сыграл в обороне?',
  goalkeeper: 'Кто лучше всех сыграл в воротах?',
};

/** Выбор одного голосующего: `userId` получателя по каждой награде; пропущенной награды в объекте нет. */
export type AwardPicks = Partial<Record<AwardKey, number>>;
export interface AwardTally { award: AwardKey; userId: number; votes: number }
export type AwardResult = { winners: number[]; votes: number } | null;
export type MatchAwardResults = Record<AwardKey, AwardResult>;
export type MatchAwardsDto = Record<AwardKey, { winners: { userId: number; name: string; photoUrl?: string | null }[]; votes: number } | null>;

export const emptyAwardCounts = (): Record<AwardKey, number> => ({ mvp: 0, forward: 0, midfielder: 0, defender: 0, goalkeeper: 0 });

/**
 * Больше всех голосов; при равенстве — выше средняя оценка за этот матч (игрок без оценок уступает
 * игроку с оценками); при полном равенстве награду делят. `averages` — по всем оценкам, без порога.
 */
export function awardWinners(tallies: readonly AwardTally[], averages: ReadonlyMap<number, number>): MatchAwardResults {
  const result = Object.fromEntries(AWARDS.map(award => [award, null])) as MatchAwardResults;
  for (const award of AWARDS) {
    const rows = tallies.filter(t => t.award === award);
    const votes = Math.max(0, ...rows.map(t => t.votes));
    if (votes < MIN_AWARD_VOTES) continue;
    const leaders = rows.filter(t => t.votes === votes).map(t => t.userId);
    const average = (userId: number) => averages.get(userId) ?? -Infinity;
    const best = Math.max(...leaders.map(average));
    const winners = leaders.filter(id => best === -Infinity || Math.abs(average(id) - best) < 1e-9);
    result[award] = { winners: [...new Set(winners)].sort((a, b) => a - b), votes };
  }
  return result;
}

/** Ключи в порядке AWARDS, чтобы один и тот же выбор сохранялся одной и той же строкой. */
export function normalizeAwardPicks(picks: AwardPicks | undefined): AwardPicks | undefined {
  const out: AwardPicks = {};
  for (const award of AWARDS) if (picks?.[award] !== undefined) out[award] = picks[award];
  return Object.keys(out).length ? out : undefined;
}
