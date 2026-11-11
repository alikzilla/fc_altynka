import { escapeHtml, formatDateRu, formatKzPhone, formatTenge, plural, type BillDto, type BillLineDto } from '@altynka/core';
import { miniAppLink, type LinkEnv } from '../telegram/links';
import { timeRange, type EventView, type PersonView, type Rendered } from './eventMessage';
import { teamBlocks } from './teamsMessage';

export function personalPayment(env: LinkEnv, view: EventView, bill: BillDto, line: BillLineDto, receiverTgId: number, reminder = false): Rendered {
  const date = formatDateRu(view.date);
  const paid = line.due === 0;
  const closed = bill.status === 'closed';
  const title = paid ? 'Оплата отмечена' : closed ? 'Счёт закрыт организатором' : reminder ? 'Напоминание об оплате' : line.paidAmount ? 'Нужна доплата' : 'За матч';
  const amount = paid ? `Отмечено — ${formatTenge(line.amount)}` : `${line.paidAmount ? 'Осталось перевести' : line.units > 1 ? `За тебя и приглашённых игроков (${line.units - 1})` : 'Твоя сумма'} — <b>${formatTenge(line.due)}</b>`;
  const html = [...teamTitle(view), `<b>${title} · ${date}</b>`, amount, '', `Получатель: ${escapeHtml(bill.receiver.name)}`,
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
    html: [...teamTitle(view), `<b>${subject} · ${formatDateRu(view.date)}</b>`,
      promoted ? 'Освободилось место — запись перешла из резерва в основу.' : `Лимит основы изменился. Место в резерве — ${position}.`,
      `${when}${view.place ? ` · ${escapeHtml(view.place)}` : ''}`, '',
      promoted ? 'Если планы изменились, отмени запись в матче.' : 'Если место освободится, бот сообщит.'].join('\n'),
    keyboard: { inline_keyboard: [[{ text: 'Открыть матч', url: miniAppLink(env, `e${view.id}`) }]] },
  };
}

export function personalMatchReminder(env: LinkEnv, view: EventView, playing: boolean, guests: string[]): Rendered {
  return {
    html: [
      ...teamTitle(view),
      `<b>Скоро матч · ${formatDateRu(view.date)}</b>`,
      `${view.startTime && view.durationHours ? timeRange(view.startTime, view.durationHours) : view.startTime ?? ''}${view.place ? ` · ${escapeHtml(view.place)}` : ''}`,
      ...(playing ? ['', 'Ты в основе. Если планы изменились, отмени запись в матче.'] : []),
      ...(guests.length ? ['', `Твои гости в основе: ${guests.map(escapeHtml).join(', ')}.`] : []),
    ].join('\n'),
    keyboard: { inline_keyboard: [[{ text: 'Открыть матч', url: miniAppLink(env, `e${view.id}`) }]] },
  };
}

export function personalReviewInvitation(env: LinkEnv, view: EventView, closesAt: number): Rendered {
  const deadline = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Almaty', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(closesAt);
  return {
    html: [...teamTitle(view), `<b>Оцени игру · ${formatDateRu(view.date)}</b>`,
      'Анонимно оцени участников и сам матч.', `Ответить можно до ${deadline} по времени Алматы.`].join('\n'),
    keyboard: { inline_keyboard: [[{ text: 'Оценить игру', url: miniAppLink(env, `r${view.id}`) }]] },
  };
}

export interface MyPlace { inMain: boolean; position: number }

/** Место самого человека в очереди; гости не считаются. */
export function placeIn(view: EventView, tgId: number): MyPlace | null {
  const main = view.main.findIndex(p => p.tgId === tgId);
  if (main >= 0) return { inMain: true, position: main + 1 };
  const reserve = view.reserve.findIndex(p => p.tgId === tgId);
  return reserve >= 0 ? { inMain: false, position: reserve + 1 } : null;
}

export const signupOpen = (view: EventView) => view.status === 'collecting' || view.status === 'scheduled';

const placeLine = (place: MyPlace | null) => place ? `Ты ${place.inMain ? 'в основе' : 'в резерве'} · место ${place.position}` : 'Ты ещё не записан';

/** Когда, где и сколько мест — те же строки в карточке матча и в главном меню. */
export function matchSummary(view: EventView, place: MyPlace | null): string[] {
  const when = view.status === 'collecting' ? 'Время и поле пока не назначены'
    : `${view.startTime && view.durationHours ? timeRange(view.startTime, view.durationHours) : 'Время пока не назначено'}${view.place ? ` · ${escapeHtml(view.place)}` : ''}`;
  const free = view.limit - view.main.length;
  const seats = !view.main.length ? `Свободно ${view.limit} ${plural(view.limit, 'место', 'места', 'мест')}`
    : `Записались ${view.main.length} из ${view.limit}${view.reserve.length ? ` · резерв ${view.reserve.length}` : free > 0 ? ` · свободно ${free}` : ''}`;
  if (!signupOpen(view)) return [when, view.status === 'playing' ? 'Игра идёт · запись закрыта' : 'Запись закрыта', ...(place?.inMain ? ['Ты в основе'] : [])];
  return [when, seats, placeLine(place)];
}

/** Одна кнопка записи: «Иду» или «Не иду» по текущему состоянию. `origin` — какой экран перерисовать после нажатия. */
export function signupButton(view: EventView, place: MyPlace | null, origin: 'h' | 'm' | 'c', label = '') {
  return { text: `${place ? 'Не иду' : 'Иду'}${label}`, callback_data: `m${place ? 'l' : 'j'}:${view.id}:${origin}` };
}

/** Карточка матча в личном чате: записаться можно прямо из сообщения. */
export function matchCard(env: LinkEnv, view: EventView, place: MyPlace | null, title = 'Футбол'): Rendered {
  const open = { text: 'Открыть матч', url: miniAppLink(env, `e${view.id}`) };
  return {
    html: [...teamTitle(view), `<b>${title} · ${formatDateRu(view.date)}</b>`, ...matchSummary(view, place),
      ...(view.comment ? ['', escapeHtml(view.comment)] : [])].join('\n'),
    keyboard: { inline_keyboard: signupOpen(view) ? [[signupButton(view, place, 'c'), open]] : [[open]] },
  };
}

/** `change` — готовый текст из scheduleChange: назначена игра или что изменилось. */
export function personalSchedule(env: LinkEnv, view: EventView, change: string, place: MyPlace | null): Rendered {
  return {
    html: [...teamTitle(view), change, '', place ? `${placeLine(place)}. Если планы изменились, отмени запись в матче.` : 'В записи твой гость.'].join('\n'),
    keyboard: { inline_keyboard: [[{ text: 'Открыть матч', url: miniAppLink(env, `e${view.id}`) }]] },
  };
}

export function personalCancelled(env: LinkEnv, view: EventView): Rendered {
  const when = view.startTime && view.durationHours ? `${timeRange(view.startTime, view.durationHours)}${view.place ? ` · ${escapeHtml(view.place)}` : ''}` : '';
  return {
    html: [...teamTitle(view), `<b>Матч отменён · ${formatDateRu(view.date)}</b>`, ...(when ? [when] : []), 'Запись закрыта, приходить не нужно.'].join('\n'),
    keyboard: { inline_keyboard: [[{ text: 'Другие матчи', url: miniAppLink(env, 'matches') }]] },
  };
}

/** Составы для одного получателя: сначала его команда и команды его гостей, ниже все составы. */
export function personalTeams(env: LinkEnv, view: EventView, teams: { emoji: string; name: string; players: PersonView[] }[], tgId: number): Rendered {
  const mine = teams.flatMap(t => t.players.flatMap(p => {
    const team = `${escapeHtml(t.emoji)} ${escapeHtml(t.name)}`;
    if (p.tgId === tgId) return [`Ты играешь за ${team}.`];
    return p.guestOf?.tgId === tgId ? [`${escapeHtml(p.name)} играет за ${team}.`] : [];
  }));
  const details = [view.startTime && view.durationHours ? timeRange(view.startTime, view.durationHours) : '', view.place ? escapeHtml(view.place) : ''].filter(Boolean).join(' · ');
  return {
    html: [[...teamTitle(view), `<b>Составы готовы · ${formatDateRu(view.date)}</b>`, ...(details ? [details] : []), '', ...mine].join('\n'),
      ...teamBlocks(teams.map(t => ({ emoji: t.emoji, name: t.name, players: t.players.map(p => escapeHtml(p.name)) })))].join('\n\n'),
    keyboard: { inline_keyboard: [[{ text: 'Открыть составы', url: miniAppLink(env, `t${view.id}`) }]] },
  };
}

function teamTitle(view: EventView): string[] {
  return view.communityTitle ? [escapeHtml(view.communityTitle), ''] : [];
}
