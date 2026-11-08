import { EVENT_STATUS_LABEL, type EventStatus, type EventSummaryDto } from '@altynka/core';

/** One status wording for every list, card and match page; it lives in core next to the DTO it labels. */
export const STATUS_LABEL = EVENT_STATUS_LABEL;

export function timeRange(start: string, hours: number): string {
  const [h, m] = start.split(':').map(Number);
  return `${start}–${String((h + hours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function whenLine(e: Pick<EventSummaryDto, 'startTime' | 'durationHours' | 'place' | 'status'>): string {
  if (e.status === 'cancelled') return EVENT_STATUS_LABEL.cancelled;
  const t = e.startTime && e.durationHours ? timeRange(e.startTime, e.durationHours) : 'Время уточняется';
  return e.place ? `${t} · ${e.place}` : t;
}

export const isOpen = (s: EventStatus) => s === 'collecting' || s === 'scheduled';
