import { escapeHtml, formatDateRu, formatKzPhone, formatTenge, plural, type LineState } from '@sbor/core';
import type { Rendered } from './eventMessage';

export interface BillView {
  billId: number;
  date?: string;
  share: number;
  status: 'open' | 'closed';
  receiver: { name: string; kaspiPhone: string };
  lines: { name: string; units: number; amount: number; state: LineState; due: number }[];
}

function forWhom(units: number): string {
  if (units <= 1) return '';
  const friends = units - 1;
  return friends === 1 ? ' (за себя и друга)' : ` (за себя и ${friends} ${plural(friends, 'друга', 'друзей', 'друзей')})`;
}

function lineText(l: BillView['lines'][number]): string {
  const name = escapeHtml(l.name);
  if (l.state === 'paid') return `✅ ${name} — ${formatTenge(l.amount)}${forWhom(l.units)}`;
  if (l.state === 'underpaid') return `⚠️ ${name} — доплатить ${formatTenge(l.due)}${forWhom(l.units)}`;
  return `⏳ ${name} — ${formatTenge(l.amount)}${forWhom(l.units)}`;
}

export function renderBillMessage(v: BillView): Rendered {
  const head = `💸 <b>Счёт${v.date ? ` · ${formatDateRu(v.date)}` : ''}</b>`;
  const who = `С каждого по <b>${formatTenge(v.share)}</b> → ${escapeHtml(v.receiver.name)}, Kaspi ${formatKzPhone(v.receiver.kaspiPhone)}`;
  const footer = v.status === 'closed' ? '\n✅ Все скинули, счёт закрыт' : '';
  const html = [head, who, '', ...v.lines.map(lineText)].join('\n') + footer;
  if (v.status === 'closed') return { html };
  return {
    html,
    keyboard: {
      inline_keyboard: [
        [
          { text: '📋 Номер Kaspi', copy_text: { text: v.receiver.kaspiPhone } },
          { text: '✅ Я скинул', callback_data: `p:${v.billId}` },
        ],
      ],
    },
  };
}
