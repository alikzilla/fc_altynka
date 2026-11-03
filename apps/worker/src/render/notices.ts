import { escapeHtml, formatDateRu, formatTenge, plural } from '@altynka/core';
import { mention } from '../telegram/links';
import type { EventView, PersonView } from './eventMessage';

export type OutNotice =
  | { kind: 'moves'; promoted: PersonView[]; demoted: PersonView[]; scheduled: boolean }
  | { kind: 'cancelled' }
  | { kind: 'reminder'; debtors: PersonView[]; amountByTgId: Record<number, number> };

/** Отметка человека; для гостя отмечается пригласивший. */
export function personMention(p: PersonView): string {
  if (p.guestOf) return `${escapeHtml(p.name)} (друг: ${mention(p.guestOf.tgId, p.guestOf.name)})`;
  return p.tgId !== null ? mention(p.tgId, p.name) : escapeHtml(p.name);
}

export function renderNotice(n: OutNotice, v: EventView): string {
  const date = formatDateRu(v.date);
  switch (n.kind) {
    case 'cancelled':
      return `❌ Сбор на ${date} отменён`;
    case 'reminder': {
      const lines = n.debtors.map(p => `• ${personMention(p)} — ${formatTenge(n.amountByTgId[p.tgId ?? -1] ?? 0)}`);
      return ['💸 Напоминание: не забудьте скинуть за поле', ...lines].join('\n');
    }
    case 'moves': {
      const lines: string[] = [];
      if (n.scheduled) {
        const hours = v.durationHours ? `, ${v.durationHours} ${plural(v.durationHours, 'час', 'часа', 'часов')}` : '';
        lines.push(`⚽ Игра назначена: ${date}, ${v.startTime ?? ''}${hours}${v.place ? ` · ${escapeHtml(v.place)}` : ''}`);
      }
      if (n.promoted.length) lines.push(`✅ В основе: ${n.promoted.map(personMention).join(', ')}`);
      if (n.demoted.length) lines.push(`↩️ В резерв: ${n.demoted.map(personMention).join(', ')}`);
      return lines.join('\n');
    }
  }
}
