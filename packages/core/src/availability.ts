import type { CommunityDto } from './api';

/** Часть дня, когда человек может играть; пустой список у «могу» значит «в любое время». */
export const DAY_PARTS = ['morning', 'day', 'evening'] as const;
export type DayPart = (typeof DAY_PARTS)[number];
export const DAY_PART_LABEL: Record<DayPart, string> = { morning: 'Утро', day: 'День', evening: 'Вечер' };

export type AvailabilityStatus = 'yes' | 'no';
/** Отметка на день; её отсутствие (null) значит «не указано». */
export interface AvailabilityMark { status: AvailabilityStatus; parts: DayPart[] }

/** На сколько дней вперёд, считая сегодня, показывается календарь: дальше недели планы мало кто знает. */
export const AVAILABILITY_DAYS = 7;
/** Понедельник первый, как в календаре. */
export const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
export const WEEKDAY_LONG = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'] as const;

export type WeeklyAvailability = (AvailabilityMark | null)[];
export const emptyWeekly = (): WeeklyAvailability => Array.from({ length: 7 }, () => null);

/** '2026-11-11' → 2 (среда); понедельник — 0. */
export function weekdayOf(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Даты календаря: сегодня и следующие дни. */
export function availabilityDates(today: string, count = AVAILABILITY_DAYS): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i));
}

/** Части дня без повторов и в порядке утро → вечер; у «не могу» частей нет. */
export function normalizeMark(mark: { status: AvailabilityStatus; parts?: readonly DayPart[] }): AvailabilityMark {
  return { status: mark.status, parts: mark.status === 'yes' ? DAY_PARTS.filter(p => mark.parts?.includes(p)) : [] };
}

/** Отметка на дату важнее обычного графика; без обеих — «не указано». */
export function resolveAvailability(weekly: WeeklyAvailability, overrides: Record<string, AvailabilityMark | undefined>, date: string): AvailabilityMark | null {
  return overrides[date] ?? weekly[weekdayOf(date)] ?? null;
}

/** «Могу · вечер», «Могу», «Не могу», «Не указано». */
export function availabilityLabel(mark: AvailabilityMark | null): string {
  if (!mark) return 'Не указано';
  if (mark.status === 'no') return 'Не могу';
  return mark.parts.length ? `Могу · ${mark.parts.map(p => DAY_PART_LABEL[p].toLowerCase()).join(', ')}` : 'Могу';
}

export interface AvailabilityDayDto {
  date: string;
  /** Итог для этой даты: отметка на дату или обычный график. */
  mark: AvailabilityMark | null;
  /** true — на дату стоит своя отметка, а не обычный график. */
  override: boolean;
}

export interface AvailabilityDto {
  /** Обычный график по дням недели, понедельник первый. */
  weekly: WeeklyAvailability;
  days: AvailabilityDayDto[];
}

export interface AvailabilityPersonDto { userId: number; name: string; parts: DayPart[] }

/** Сводка по группе для организатора: кто может и кто не может в каждый из ближайших дней. */
export interface AvailabilitySummaryDto {
  community: CommunityDto;
  days: { date: string; yes: AvailabilityPersonDto[]; no: AvailabilityPersonDto[]; unknown: number }[];
}
