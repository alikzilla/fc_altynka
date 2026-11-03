export const DEFAULT_LIMIT = 10;
export const RESTORE_WINDOW_MS = 120_000;

export type Duration = 1 | 2;

export function limitFor(duration: Duration | null): number {
  return duration === 2 ? 15 : DEFAULT_LIMIT;
}

export interface QueueEntry {
  id: number;
  seq: number;
  manual: boolean;
}

export interface QueueSplit<T extends QueueEntry> {
  main: T[];
  reserve: T[];
  limit: number;
}

/**
 * Основа = все вручную переведённые + первые `baseLimit` остальных по порядку записи.
 * Ручной перевод добавляет место сверх лимита.
 */
export function splitQueue<T extends QueueEntry>(entries: T[], baseLimit: number): QueueSplit<T> {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  const manual = sorted.filter(x => x.manual);
  const regular = sorted.filter(x => !x.manual);
  const main = [...manual, ...regular.slice(0, baseLimit)].sort((a, b) => a.seq - b.seq);
  return { main, reserve: regular.slice(baseLimit), limit: baseLimit + manual.length };
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
