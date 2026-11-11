import { escapeHtml, formatDateRu } from '@altynka/core';
import { mention } from '../telegram/links';
import { timeRange, type EventView, type PersonView } from './eventMessage';
import type { ScheduleSnapshot } from '../sync/port';

export type OutNotice =
  | { kind: 'moves'; promoted: PersonView[]; demoted: PersonView[]; scheduled: boolean; previous?: ScheduleSnapshot }
  | { kind: 'cancelled' }
  | { kind: 'announced' }
  | { kind: 'teams' }
  | { kind: 'reminder'; debtors: PersonView[]; amountByTgId: Record<number, number> };

/** Отметка человека; для гостя отмечается пригласивший. */
export function personMention(p: PersonView): string {
  if (p.guestOf) return `${escapeHtml(p.name)} · приглашён: ${mention(p.guestOf.tgId, p.guestOf.name)}`;
  return p.tgId !== null ? mention(p.tgId, p.name) : escapeHtml(p.name);
}

/** «Игра назначена» или что именно изменилось; null — время и поле те же. */
export function scheduleChange(v: EventView, previous?: ScheduleSnapshot): string | null {
  const date = formatDateRu(v.date);
  const when = v.startTime && v.durationHours ? timeRange(v.startTime, v.durationHours) : 'Время пока не назначено';
  if (!previous) return `<b>Игра назначена · ${date}</b>\n${when}${v.place ? ` · ${escapeHtml(v.place)}` : ''}`;
  const changedTime = previous.startTime !== v.startTime || previous.durationHours !== v.durationHours;
  const changedPlace = previous.place !== v.place;
  if (!changedTime && !changedPlace) return null;
  const title = changedTime && changedPlace ? 'Изменились детали матча' : changedTime ? 'Изменилось время' : 'Изменилось поле';
  const oldTime = previous.startTime && previous.durationHours ? timeRange(previous.startTime, previous.durationHours) : 'Время не назначено';
  return `<b>${title} · ${date}</b>\nБыло: ${oldTime}${previous.place ? ` · ${escapeHtml(previous.place)}` : ''}\nТеперь: ${when}${v.place ? ` · ${escapeHtml(v.place)}` : ''}`;
}

export function renderNotice(n: OutNotice, v: EventView): string {
  const date = formatDateRu(v.date);
  switch (n.kind) {
    // Группа уже видит карточку матча и составы: эти события уходят только лично.
    case 'announced':
    case 'teams':
      return '';
    case 'cancelled':
      return `<b>Матч отменён · ${date}</b>\nЗапись закрыта.`;
    case 'reminder': {
      const lines = n.debtors.map(p => `• ${personMention(p)}`);
      return [`<b>Напоминание об оплате · ${date}</b>`, 'Если ещё не перевёл, открой оплату в матче.', '', ...lines].join('\n');
    }
    case 'moves': {
      const lines: string[] = [];
      const change = n.scheduled ? scheduleChange(v, n.previous) : null;
      if (change) lines.push(change);
      if (n.promoted.length) lines.push(`В основе: ${n.promoted.map(personMention).join(', ')}`);
      if (n.demoted.length) lines.push(`В резерве: ${n.demoted.map(personMention).join(', ')}`);
      return lines.join('\n\n');
    }
  }
}
