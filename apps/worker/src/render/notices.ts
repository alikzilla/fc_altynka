import { escapeHtml, formatDateRu } from '@altynka/core';
import { mention } from '../telegram/links';
import { timeRange, type EventView, type PersonView } from './eventMessage';
import type { ScheduleSnapshot } from '../sync/port';

export type OutNotice =
  | { kind: 'moves'; promoted: PersonView[]; demoted: PersonView[]; scheduled: boolean; previous?: ScheduleSnapshot }
  | { kind: 'cancelled' }
  | { kind: 'reminder'; debtors: PersonView[]; amountByTgId: Record<number, number> };

/** Отметка человека; для гостя отмечается пригласивший. */
export function personMention(p: PersonView): string {
  if (p.guestOf) return `${escapeHtml(p.name)} · приглашён: ${mention(p.guestOf.tgId, p.guestOf.name)}`;
  return p.tgId !== null ? mention(p.tgId, p.name) : escapeHtml(p.name);
}

export function renderNotice(n: OutNotice, v: EventView): string {
  const date = formatDateRu(v.date);
  switch (n.kind) {
    case 'cancelled':
      return `<b>Матч отменён · ${date}</b>\nЗапись закрыта.`;
    case 'reminder': {
      const lines = n.debtors.map(p => `• ${personMention(p)}`);
      return [`<b>Напоминание об оплате · ${date}</b>`, 'Если ещё не перевёл, открой оплату в матче.', '', ...lines].join('\n');
    }
    case 'moves': {
      const lines: string[] = [];
      if (n.scheduled) {
        const when = v.startTime && v.durationHours ? timeRange(v.startTime, v.durationHours) : 'Время пока не назначено';
        if (!n.previous) lines.push(`<b>Игра назначена · ${date}</b>\n${when}${v.place ? ` · ${escapeHtml(v.place)}` : ''}`);
        else {
          const changedTime = n.previous.startTime !== v.startTime || n.previous.durationHours !== v.durationHours;
          const changedPlace = n.previous.place !== v.place;
          const title = changedTime && changedPlace ? 'Изменились детали матча' : changedTime ? 'Изменилось время' : 'Изменилось поле';
          if (changedTime || changedPlace) {
            const oldTime = n.previous.startTime && n.previous.durationHours ? timeRange(n.previous.startTime, n.previous.durationHours) : 'Время не назначено';
            lines.push(`<b>${title} · ${date}</b>\nБыло: ${oldTime}${n.previous.place ? ` · ${escapeHtml(n.previous.place)}` : ''}\nТеперь: ${when}${v.place ? ` · ${escapeHtml(v.place)}` : ''}`);
          }
        }
      }
      if (n.promoted.length) lines.push(`В основе: ${n.promoted.map(personMention).join(', ')}`);
      if (n.demoted.length) lines.push(`В резерве: ${n.demoted.map(personMention).join(', ')}`);
      return lines.join('\n\n');
    }
  }
}
