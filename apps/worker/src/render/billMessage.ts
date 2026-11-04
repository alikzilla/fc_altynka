import { escapeHtml, formatDateRu, formatKzPhone, formatTenge, type LineState } from '@altynka/core';
import type { InlineKeyboardButton } from 'grammy/types';
import { miniAppLink, type LinkEnv } from '../telegram/links';
import type { Rendered } from './eventMessage';

export interface BillView {
  billId: number;
  date?: string;
  share: number;
  status: 'open' | 'closed';
  receiver: { name: string; kaspiPhone: string };
  lines: { name: string; units: number; amount: number; state: LineState; due: number }[];
}

export function renderBillMessage(v: BillView, eventId?: number, env?: LinkEnv): Rendered {
  const head = `<b>Оплата${v.date ? ` · ${formatDateRu(v.date)}` : ''}</b>`;
  const phone = v.receiver.kaspiPhone;
  const paid = v.lines.filter(l => l.state === 'paid').length;
  const parts = [
    head,
    `С человека — <b>${formatTenge(v.share)}</b>`,
    `Получатель — ${escapeHtml(v.receiver.name)}`,
    phone ? `Kaspi: ${formatKzPhone(phone)}` : 'Kaspi не указан',
    '',
    v.lines.length ? `Отметили оплату · ${paid} из ${v.lines.length}` : 'Нет долей для оплаты',
  ];
  if (v.status === 'closed') {
    parts.push('', v.lines.length > 0 && paid === v.lines.length
      ? 'Все отметили оплату · счёт закрыт'
      : 'Счёт закрыт организатором');
  }
  const html = parts.join('\n');
  if (v.status === 'closed' || !v.lines.length) return { html };
  const buttons: InlineKeyboardButton[] = [];
  if (env && eventId !== undefined) buttons.push({ text: 'Открыть оплату', url: miniAppLink(env, `b${eventId}`) });
  // copy_text с пустым текстом Telegram отклоняет.
  if (phone) buttons.push({ text: 'Скопировать номер', copy_text: { text: phone } });
  return buttons.length ? { html, keyboard: { inline_keyboard: [buttons] } } : { html };
}
