export const TEAMS = [
  { key: 'red', name: 'Красные', emoji: '🔴' },
  { key: 'blue', name: 'Синие', emoji: '🔵' },
  { key: 'yellow', name: 'Жёлтые', emoji: '🟡' },
] as const;

export type TeamCount = 2 | 3;

export const TEAM_COLORS = [
  { ...TEAMS[0], label: 'Красный' },
  { ...TEAMS[1], label: 'Синий' },
  { ...TEAMS[2], label: 'Жёлтый' },
  { key: 'green', name: 'Зелёные', emoji: '🟢', label: 'Зелёный' },
  { key: 'white', name: 'Белые', emoji: '⚪', label: 'Белый' },
  { key: 'black', name: 'Чёрные', emoji: '⚫', label: 'Чёрный' },
] as const;
export type TeamColor = typeof TEAM_COLORS[number]['key'];

export function teamAppearance(index: number, colors?: readonly string[] | null) {
  return TEAM_COLORS.find(color => color.key === colors?.[index]) ?? TEAM_COLORS[index] ?? TEAM_COLORS[0];
}

/** Preserve team identities when the number of teams changes. */
export function teamColorsFor(count: TeamCount, colors?: readonly string[] | null): TeamColor[] {
  const selected: TeamColor[] = [];
  for (let i = 0; i < count; i++) {
    const requested = TEAM_COLORS.find(c => c.key === colors?.[i] && !selected.includes(c.key));
    const fallback = TEAM_COLORS[i];
    selected.push(requested?.key ?? (!selected.includes(fallback.key) ? fallback.key : TEAM_COLORS.find(c => !selected.includes(c.key))!.key));
  }
  return selected;
}

export function teamCountFor(mainCount: number): TeamCount {
  return mainCount >= 15 ? 3 : 2;
}

export interface Rated {
  id: number;
  level: number;
}

export function spread(teams: Rated[][]): number {
  const s = teams.map(t => t.reduce((a, p) => a + Math.round(p.level * 10), 0));
  return (Math.max(...s) - Math.min(...s)) / 10;
}

/** mulberry32: детерминированный ГПСЧ для тестов и повторяемости. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RESTARTS = 200;

function sizesFor(n: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.floor(n / count) + (i < n % count ? 1 : 0));
}

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Случайный старт + обмены пар между командами, пока разброс сумм уменьшается. */
function localSearch(players: Rated[], count: number, rng: () => number): Rated[][] {
  const sizes = sizesFor(players.length, count);
  const pool = shuffle(players, rng);
  const teams: Rated[][] = [];
  let k = 0;
  for (const size of sizes) {
    teams.push(pool.slice(k, k + size));
    k += size;
  }
  let cur = spread(teams);
  let improved = true;
  while (improved && cur > 0) {
    improved = false;
    for (let x = 0; x < count; x++)
      for (let y = x + 1; y < count; y++)
        for (let i = 0; i < teams[x].length; i++)
          for (let j = 0; j < teams[y].length; j++) {
            [teams[x][i], teams[y][j]] = [teams[y][j], teams[x][i]];
            const next = spread(teams);
            if (next < cur) {
              cur = next;
              improved = true;
            } else {
              [teams[x][i], teams[y][j]] = [teams[y][j], teams[x][i]];
            }
          }
  }
  return teams;
}

const toIds = (teams: Rated[][]) => teams.map(t => t.map(p => p.id));

function canonical(teams: number[][]): string {
  return JSON.stringify(teams.map(t => [...t].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]));
}

/** Массив id по командам в порядке TEAMS; размеры равны или отличаются на 1. */
export function balanceTeams(players: Rated[], count: TeamCount, rng: () => number = Math.random): number[][] {
  let best: Rated[][] | null = null;
  let bestSpread = Infinity;
  for (let r = 0; r < RESTARTS && bestSpread > 0; r++) {
    const t = localSearch(players, count, rng);
    const s = spread(t);
    if (s < bestSpread) {
      bestSpread = s;
      best = t;
    }
  }
  return toIds(best ?? [[], [], []].slice(0, count));
}

/** Другой расклад, не хуже лучшего более чем на 1 очко. */
export function alternativeSplit(
  players: Rated[],
  count: TeamCount,
  current: number[][],
  rng: () => number = Math.random,
): number[][] {
  const found = new Map<string, { ids: number[][]; spread: number }>();
  let bestSpread = Infinity;
  for (let r = 0; r < RESTARTS; r++) {
    const t = localSearch(players, count, rng);
    const s = spread(t);
    const ids = toIds(t);
    found.set(canonical(ids), { ids, spread: s });
    bestSpread = Math.min(bestSpread, s);
  }
  const exclude = canonical(current);
  const options = [...found.entries()]
    .filter(([key, v]) => key !== exclude && v.spread <= bestSpread + 1)
    .map(([, v]) => v.ids);
  if (!options.length) return balanceTeams(players, count, rng);
  return options[Math.floor(rng() * options.length)];
}
