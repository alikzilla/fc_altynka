import type { EventStatus } from './api';

type Timing = { date: string; startTime: string | null };
type Match = Timing & { status: EventStatus; protocolVersion?: 0 | 1; startedAt?: number | null; completedAt?: number | null };
const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

/** Convert a match's local wall time using the IANA zone, including midnight boundaries. */
export function matchStartsAt({ date, startTime }: Timing): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = startTime.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(target).toISOString().slice(0, 10) !== date) return null;
  let value = target;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(localTime.formatToParts(value).map(p => [p.type, p.value]));
    value += target - Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  }
  return value;
}

/** Playing is derived, so clock enforcement never depends on a background status update. */
export function matchPhase(event: Match, now = Date.now()): EventStatus {
  if (event.protocolVersion === 1) {
    if (event.status === 'cancelled') return 'cancelled';
    if (event.completedAt != null) return event.status === 'billing' ? 'billing' : 'closed';
    if (event.startedAt != null) return 'playing';
    return event.status;
  }
  const start = matchStartsAt(event);
  return event.status === 'scheduled' && start !== null && now >= start ? 'playing' : event.status;
}

export function registrationOpen(event: Match, now = Date.now()): boolean {
  const phase = matchPhase(event, now);
  return phase === 'collecting' || phase === 'scheduled';
}
