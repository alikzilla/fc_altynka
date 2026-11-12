import type { CommunityDto } from './api';

/** Окно времени, когда человек может играть. У «могу» выбрано хотя бы одно окно. */
export const DAY_PARTS = ['morning', 'noon', 'afternoon', 'evening', 'night', 'late'] as const;
export type DayPart = (typeof DAY_PARTS)[number];
export const DAY_PART_LABEL: Record<DayPart, string> = { morning: 'До 12:00', noon: '12:00–15:00', afternoon: '15:00–18:00', evening: '18:00–20:00', night: '20:00–22:00', late: 'После 22:00' };

export type AvailabilityStatus = 'yes' | 'no';
/** Отметка на день; её отсутствие (null) значит «не указано». */
export interface AvailabilityMark { status: AvailabilityStatus; parts: DayPart[] }

/** На сколько дней вперёд, считая сегодня, показывается календарь: дальше недели планы мало кто знает. */
export const AVAILABILITY_DAYS = 7;
/** Понедельник первый, как в календаре. */
export const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

/** '2026-11-11' → 2 (среда); понедельник — 0. */
export function weekdayOf(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Понедельник недели, в которую попадает дата. */
export function weekStart(date: string): string {
  return addDays(date, -weekdayOf(date));
}

/** Начало недели (понедельник, 00:00 по Алматы) в миллисекундах; Алматы круглый год UTC+5. */
export function weekStartsAt(today: string): number {
  return Date.parse(`${weekStart(today)}T00:00:00+05:00`);
}

/** Даты календаря: сегодня и следующие дни. */
export function availabilityDates(today: string, count = AVAILABILITY_DAYS): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i));
}

/** Окна времени без повторов и по порядку; у «не могу» частей нет. */
export function normalizeMark(mark: { status: AvailabilityStatus; parts?: readonly DayPart[] }): AvailabilityMark {
  return { status: mark.status, parts: mark.status === 'yes' ? DAY_PARTS.filter(p => mark.parts?.includes(p)) : [] };
}

/** «Могу · 18:00–20:00, 20:00–22:00», «Могу · весь день», «Не могу», «Не указано». */
export function availabilityLabel(mark: AvailabilityMark | null): string {
  if (!mark) return 'Не указано';
  if (mark.status === 'no') return 'Не могу';
  if (!mark.parts.length || mark.parts.length === DAY_PARTS.length) return 'Могу · весь день';
  return `Могу · ${mark.parts.map(p => DAY_PART_LABEL[p].toLowerCase()).join(', ')}`;
}

export interface AvailabilityDayDto {
  date: string;
  mark: AvailabilityMark | null;
}

export interface AvailabilityDto {
  days: AvailabilityDayDto[];
  /** Человек уже отмечал дни на этой неделе (с понедельника по Алматы): еженедельная просьба не нужна. */
  markedThisWeek: boolean;
}

export interface AvailabilityPersonDto { userId: number; name: string; parts: DayPart[] }

/** Сводка по группе для организатора: кто может и кто не может в каждый из ближайших дней. */
export interface AvailabilitySummaryDto {
  community: CommunityDto;
  days: { date: string; yes: AvailabilityPersonDto[]; no: AvailabilityPersonDto[]; unknown: number }[];
}
