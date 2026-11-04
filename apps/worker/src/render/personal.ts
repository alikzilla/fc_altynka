import { escapeHtml, formatDateRu, formatKzPhone, formatTenge, type BillDto, type BillLineDto } from '@altynka/core';
import { miniAppLink, type LinkEnv } from '../telegram/links';
import { timeRange, type EventView, type PersonView, type Rendered } from './eventMessage';

export function personalPayment(env: LinkEnv, view: EventView, bill: BillDto, line: BillLineDto, receiverTgId: number, reminder = false): Rendered {
  const date = formatDateRu(view.date);
  const paid = line.due === 0;
  const closed = bill.status === 'closed';
  const title = paid ? 'Оплата отмечена' : closed ? 'Счёт закрыт организатором' : reminder ? 'Напоминание об оплате' : line.paidAmount ? 'Нужна доплата' : 'За матч';
  const amount = paid ? `Отмечено — ${formatTenge(line.amount)}` : `${line.paidAmount ? 'Осталось перевести' : line.units > 1 ? `За тебя и приглашённых игроков (${line.units - 1})` : 'Твоя сумма'} — <b>${formatTenge(line.due)}</b>`;
  const html = [`<b>${title} · ${date}</b>`, amount, '', `Получатель: ${escapeHtml(bill.receiver.name)}`,
    bill.receiver.kaspiPhone ? `Kaspi: ${formatKzPhone(bill.receiver.kaspiPhone)}` : 'Номер Kaspi пока не указан',
    ...(!paid && !closed ? ['', 'После перевода отметь оплату.'] : [])].join('\n');
  return { html, keyboard: { inline_keyboard: [
    [{ text: 'Открыть оплату', url: miniAppLink(env, `b${view.id}`) }],
    ...(!paid && !closed ? [[
      ...(bill.receiver.kaspiPhone ? [{ text: 'Скопировать номер', copy_text: { text: bill.receiver.kaspiPhone } }] : []),
      ...(bill.receiver.kaspiPhone ? [{ text: 'Я перевёл', callback_data: `pp:${bill.id}:${line.due}:${receiverTgId}:${bill.receiver.kaspiPhone.replace(/\D/g, '')}` }] : []),
    ]] : []),
  ] } };
}

export function personalMovement(env: LinkEnv, view: EventView, person: PersonView, promoted: boolean): Rendered {
  const place = promoted ? 'в основе' : 'в резерве';
  const subject = person.guestOf ? `${escapeHtml(person.name)} теперь ${place}` : `Ты ${place}`;
  const position = (promoted ? view.main : view.reserve).findIndex(p => p.signupId === person.signupId) + 1;
  const when = view.startTime && view.durationHours ? timeRange(view.startTime, view.durationHours) : 'Время пока не назначено';
  return {
    html: [`<b>${subject} · ${formatDateRu(view.date)}</b>`,
      promoted ? 'Освободилось место — запись перешла из резерва в основу.' : `Лимит основы изменился. Место в резерве — ${position}.`,
      `${when}${view.place ? ` · ${escapeHtml(view.place)}` : ''}`, '',
      promoted ? 'Если планы изменились, отмени запись в матче.' : 'Если место освободится, бот сообщит.'].join('\n'),
    keyboard: { inline_keyboard: [[{ text: 'Открыть матч', url: miniAppLink(env, `e${view.id}`) }]] },
  };
}
