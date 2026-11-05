import type { EventStatus, EventSummaryDto } from '@altynka/core';

export const STATUS_LABEL: Record<EventStatus, string> = {
  collecting: 'Время уточняется',
  scheduled: 'Игра назначена',
  playing: 'Игра началась',
  billing: 'Сбор денег',
  closed: 'Прошёл',
  cancelled: 'Отменён',
};

export function timeRange(start: string, hours: number): string {
  const [h, m] = start.split(':').map(Number);
  return `${start}–${String((h + hours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function whenLine(e: Pick<EventSummaryDto, 'startTime' | 'durationHours' | 'place' | 'status'>): string {
  if (e.status === 'cancelled') return 'Отменён';
  const t = e.startTime && e.durationHours ? timeRange(e.startTime, e.durationHours) : 'Время уточняется';
  return e.place ? `${t} · ${e.place}` : t;
}

export const isOpen = (s: EventStatus) => s === 'collecting' || s === 'scheduled';
