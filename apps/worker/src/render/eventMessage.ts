import { escapeHtml, formatDateRu, plural, type EventStatus } from '@altynka/core';
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
  return p.guestOf ? `${escapeHtml(p.name)} · приглашён: ${escapeHtml(p.guestOf.name)}` : escapeHtml(p.name);
}

function statusLine(v: EventView): string {
  switch (v.status) {
    case 'cancelled':
      return '<b>Матч отменён</b>';
    case 'collecting':
      return 'Время и поле пока не назначены';
    default: {
      const when = v.startTime && v.durationHours ? timeRange(v.startTime, v.durationHours) : 'Время пока не назначено';
      const tail = v.status === 'billing' ? '\nЗапись закрыта · доступна оплата' : v.status === 'closed' ? '\nСчёт закрыт' : '';
      return `${when}${v.place ? ` · ${escapeHtml(v.place)}` : ''}${tail}`;
    }
  }
}

const numbered = (ps: PersonView[]) => ps.map((p, i) => `${i + 1}. ${plainName(p)}`).join('\n');

export function renderEventMessage(v: EventView, env: LinkEnv): Rendered {
  const parts = [`<b>Футбол · ${formatDateRu(v.date)}</b>`, statusLine(v)];
  const signupOpen = v.status === 'collecting' || v.status === 'scheduled';
  if (v.main.length) {
    parts.push('', `<b>${v.status === 'collecting' ? 'Записались' : 'Основа'} · ${v.main.length} из ${v.limit}</b>`, numbered(v.main));
  } else if (signupOpen) {
    parts.push('', `<b>Запись открыта · ${v.limit} ${plural(v.limit, 'место', 'места', 'мест')}</b>`);
  }
  if (v.reserve.length) parts.push('', `<b>Резерв · ${v.reserve.length}</b>`, numbered(v.reserve));
  if (v.comment) parts.push('', escapeHtml(v.comment));
  const open = { text: 'Открыть матч', url: miniAppLink(env, `e${v.id}`) };
  const keyboard: InlineKeyboardMarkup =
    signupOpen
      ? {
          inline_keyboard: [
            [
              { text: 'Иду', callback_data: `j:${v.id}` },
              { text: 'Не иду', callback_data: `l:${v.id}` },
            ],
            [{ text: 'Добавить друга', url: miniAppLink(env, `g${v.id}`) }, open],
          ],
        }
      : { inline_keyboard: [[open]] };
  return { html: parts.join('\n'), keyboard };
}
