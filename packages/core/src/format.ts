export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const NBSP = ' ';

export function formatTenge(n: number): string {
  const digits = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${digits}${NBSP}₸`;
}

export const TIME_ZONE = 'Asia/Almaty';

/** Сегодняшняя дата по Алматы в формате YYYY-MM-DD. */
export function todayAlmaty(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** '2026-11-07' → 'суббота, 7 ноября' */
export function formatDateRu(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

/** Любой привычный ввод казахстанского номера → '+7XXXXXXXXXX', иначе null. */
export function normalizeKzPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '8' || digits[0] === '7')) return `+7${digits.slice(1)}`;
  if (digits.length === 10 && digits[0] === '7') return `+7${digits}`;
  return null;
}

/** '+77071234567' → '+7 707 123 45 67' */
export function formatKzPhone(e164: string): string {
  const d = e164.replace(/\D/g, '').slice(1);
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}

/** 'Дамир' + 'Касымов' → 'Дамир К.' */
export function defaultDisplayName(first: string, last?: string | null): string {
  const f = first.trim();
  const l = (last ?? '').trim();
  return l ? `${f} ${l[0]}.` : f;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One wording for a match's status in every list, card and page (матч — whole event, игра N — short game). */
export const EVENT_STATUS_LABEL: Record<import('./api').EventStatus, string> = {
  collecting: 'Идёт сбор',
  scheduled: 'Матч назначен',
  playing: 'Матч идёт',
  billing: 'Сбор оплаты',
  closed: 'Матч завершён',
  cancelled: 'Матч отменён',
};
