import type { Notice } from './port';

export const MIN_GAP_MS = 3000;
/** Первая правка после затишья ждёт чуть-чуть, чтобы собрать всплеск нажатий в одну. */
export const BURST_MS = 300;

export type MergedNotice =
  | { kind: 'moves'; promoted: number[]; demoted: number[]; scheduled: boolean }
  | { kind: 'cancelled' }
  | { kind: 'reminder'; billId: number };

export function nextAlarmAt(now: number, lastSentAt: number | null): number {
  return Math.max(now + BURST_MS, (lastSentAt ?? -Infinity) + MIN_GAP_MS);
}

/** Склеивает накопленные уведомления по текущему состоянию очереди. */
export function mergeNotices(pending: Notice[], mainIds: Set<number>): MergedNotice[] {
  if (pending.some(n => n.kind === 'cancelled')) return [{ kind: 'cancelled' }];
  const promoted = new Set<number>();
  const demoted = new Set<number>();
  let scheduled = false;
  const reminders: number[] = [];
  for (const n of pending) {
    if (n.kind === 'promoted') n.signupIds.forEach(id => promoted.add(id));
    else if (n.kind === 'demoted') n.signupIds.forEach(id => demoted.add(id));
    else if (n.kind === 'scheduled') scheduled = true;
    else if (n.kind === 'reminder' && !reminders.includes(n.billId)) reminders.push(n.billId);
  }
  const up = [...promoted].filter(id => mainIds.has(id) && !demoted.has(id));
  const down = [...demoted].filter(id => !mainIds.has(id) && !promoted.has(id));
  const out: MergedNotice[] = [];
  if (scheduled || up.length || down.length) out.push({ kind: 'moves', promoted: up, demoted: down, scheduled });
  for (const billId of reminders) out.push({ kind: 'reminder', billId });
  return out;
}

/** Обратно в исходные уведомления — чтобы сохранить неотправленное после 429. */
export function unmerge(m: MergedNotice): Notice[] {
  if (m.kind !== 'moves') return [m];
  const out: Notice[] = [];
  if (m.scheduled) out.push({ kind: 'scheduled' });
  if (m.promoted.length) out.push({ kind: 'promoted', signupIds: m.promoted });
  if (m.demoted.length) out.push({ kind: 'demoted', signupIds: m.demoted });
  return out;
}
