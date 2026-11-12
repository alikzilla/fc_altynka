export const DEFAULT_LIMIT = 10 as const;
export const RESTORE_WINDOW_MS = 120_000;

export type Duration = 1 | 2;

/** Формат матча задаёт размер основы: две или три команды по пять или шесть человек. */
export const MATCH_FORMATS = [
  { limit: 10, teamSize: 5, teamCount: 2, label: '5×5' },
  { limit: 12, teamSize: 6, teamCount: 2, label: '6×6' },
  { limit: 15, teamSize: 5, teamCount: 3, label: '5×5×5' },
  { limit: 18, teamSize: 6, teamCount: 3, label: '6×6×6' },
] as const;
export type MatchFormat = (typeof MATCH_FORMATS)[number];
export type MatchLimit = MatchFormat['limit'];
export const MATCH_LIMITS = MATCH_FORMATS.map(f => f.limit) as [MatchLimit, ...MatchLimit[]];

export const matchFormat = (limit: number): MatchFormat | undefined => MATCH_FORMATS.find(f => f.limit === limit);

/** Основа по умолчанию, когда формат не выбран: час — две пятёрки, два часа — три. */
export function limitFor(duration: Duration | null): MatchLimit {
  return duration === 2 ? 15 : DEFAULT_LIMIT;
}

export interface QueueEntry {
  id: number;
  seq: number;
}

export interface QueueSplit<T extends QueueEntry> {
  main: T[];
  reserve: T[];
  limit: number;
}

/** Строго по очереди: основа — первые `baseLimit` по порядку записи, остальные в резерве. */
export function splitQueue<T extends QueueEntry>(entries: T[], baseLimit: number): QueueSplit<T> {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  return { main: sorted.slice(0, baseLimit), reserve: sorted.slice(baseLimit), limit: baseLimit };
}

/** Кто был в резерве и стал в основе. */
export function promotedIds(before: QueueSplit<QueueEntry>, after: QueueSplit<QueueEntry>): number[] {
  const wasReserve = new Set(before.reserve.map(x => x.id));
  return after.main.filter(x => wasReserve.has(x.id)).map(x => x.id);
}

/** Кто был в основе и ушёл в резерв. */
export function demotedIds(before: QueueSplit<QueueEntry>, after: QueueSplit<QueueEntry>): number[] {
  const wasMain = new Set(before.main.map(x => x.id));
  return after.reserve.filter(x => wasMain.has(x.id)).map(x => x.id);
}

export function canRestore(leftAt: number | null, now: number): boolean {
  return leftAt !== null && now - leftAt <= RESTORE_WINDOW_MS;
}
