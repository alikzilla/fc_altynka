import { escapeHtml, formatDateRu, type EventStatus } from '@altynka/core';
import type { InlineKeyboardMarkup } from 'grammy/types';
import { miniAppLink, type LinkEnv } from '../telegram/links';

export interface Rendered {
  html: string;
  keyboard?: InlineKeyboardMarkup;
}

export interface PersonView {
  signupId: number;
  name: string;
  tgId: number | null;
  guestOf: { name: string; tgId: number } | null;
}

export interface EventView {
  id: number;
  date: string;
  status: EventStatus;
  startTime: string | null;
  durationHours: 1 | 2 | null;
  place: string | null;
  comment: string | null;
  limit: number;
  main: PersonView[];
  reserve: PersonView[];
}

/** '21:00' + 2 → '21:00–23:00' (через полночь тоже). */
export function timeRange(start: string, hours: number): string {
  const [h, m] = start.split(':').map(Number);
  const end = `${String((h + hours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return `${start}–${end}`;
}

/** Имя для списка: без отметок, с пометкой гостя. */
export function plainName(p: PersonView): string {
  return p.guestOf ? `${escapeHtml(p.name)} (друг: ${escapeHtml(p.guestOf.name)})` : escapeHtml(p.name);
}

function statusLine(v: EventView): string {
  switch (v.status) {
    case 'cancelled':
      return '❌ <b>Отменён</b>';
    case 'collecting':
      return '🕘 Время уточняется';
    default: {
      const when = v.startTime && v.durationHours ? timeRange(v.startTime, v.durationHours) : 'Время уточняется';
      const tail = v.status === 'billing' ? '\n💸 Идёт сбор денег' : v.status === 'closed' ? '\n✅ Игра прошла' : '';
      return `🕘 ${when}${v.place ? ` · ${escapeHtml(v.place)}` : ''}${tail}`;
    }
  }
}

const numbered = (ps: PersonView[]) => ps.map((p, i) => `${i + 1}. ${plainName(p)}`).join('\n');

export function renderEventMessage(v: EventView, env: LinkEnv): Rendered {
  const parts = [`⚽ <b>Футбол · ${formatDateRu(v.date)}</b>`, statusLine(v)];
  if (v.comment) parts.push(`💬 ${escapeHtml(v.comment)}`);
  parts.push('', `<b>Идут ${v.main.length}/${v.limit}</b>`, v.main.length ? numbered(v.main) : '—');
  if (v.reserve.length) parts.push('', `<b>Резерв</b>`, numbered(v.reserve));
  const open = { text: '📱 Открыть', url: miniAppLink(env, `e${v.id}`) };
  const keyboard: InlineKeyboardMarkup =
    v.status === 'collecting' || v.status === 'scheduled'
      ? {
          inline_keyboard: [
            [
              { text: '✅ Иду', callback_data: `j:${v.id}` },
              { text: '❌ Не иду', callback_data: `l:${v.id}` },
            ],
            [{ text: '➕ Друг', url: miniAppLink(env, `g${v.id}`) }, open],
          ],
        }
      : { inline_keyboard: [[open]] };
  return { html: parts.join('\n'), keyboard };
}
