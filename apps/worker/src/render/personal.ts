import { ACHIEVEMENT_TIER_LABEL, ACHIEVEMENT_TIER_TO, AWARD_LABEL, escapeHtml, formatDateRu, formatKzPhone, formatTenge, plural, type BillDto, type BillLineDto, type AchievementTier, type AwardKey, type CeremonyStats, type PlayerAchievement, type PlayerProtocolSummary } from '@altynka/core';
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

/** Одно напоминание тем, кто не ответил через пару часов после приглашения. */
export function personalReviewReminder(env: LinkEnv, view: EventView, closesAt: number): Rendered {
  const deadline = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Almaty', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(closesAt);
  return {
    html: [...teamTitle(view), `<b>Опрос ждёт тебя · ${formatDateRu(view.date)}</b>`,
      'Оцени игроков, выбери MVP и лучших по позициям. Рядом с каждым видно, сколько он забил и отдал пасов. Анонимно и займёт пару минут.',
      `Ответить можно до ${deadline} по времени Алматы.`].join('\n'),
    keyboard: { inline_keyboard: [[{ text: 'Пройти опрос', url: miniAppLink(env, `r${view.id}`) }]] },
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

const placeLine = (place: MyPlace | null) => place ? `Ты ${place.inMain ? 'в основе' : 'в резерве'}` : 'Ты ещё не записан';

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

/** Строка в объявлении о матче для того, кто отметил этот день в календаре доступности. */
export const AVAILABLE_NOTE = 'В твоём календаре этот день отмечен свободным.';

/** Понедельничное напоминание: отметить дни на неделю. Не привязано к матчу и группе. */
export function availabilityReminder(env: LinkEnv): Rendered {
  return {
    html: ['<b>Когда сможешь играть на этой неделе?</b>',
      'Отметь дни в календаре. Организатор увидит, кто может, и выберет день для игры, а в занятые дни бот не напишет о новом матче.'].join('\n'),
    keyboard: { inline_keyboard: [[{ text: 'Отметить дни', url: miniAppLink(env, 'availability') }]] },
  };
}

/** Карточка матча в личном чате: записаться можно прямо из сообщения. */
export function matchCard(env: LinkEnv, view: EventView, place: MyPlace | null, title = 'Футбол', note?: string): Rendered {
  const open = { text: 'Открыть матч', url: miniAppLink(env, `e${view.id}`) };
  return {
    html: [...teamTitle(view), `<b>${title} · ${formatDateRu(view.date)}</b>`, ...matchSummary(view, place), ...(note ? ['', note] : [])].join('\n'),
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

/** Итог встречи для одного игрока: его голы, передачи, короткие игры и открытые этой встречей уровни достижений. */
export function personalResult(env: LinkEnv, view: EventView, summary: Omit<PlayerProtocolSummary, 'results'>, raised: PlayerAchievement[]): Rendered {
  const g = summary.goals;
  const goals = `${g} ${plural(g, 'гол', 'гола', 'голов')}`;
  const headline = g >= 5 ? `Вот это игра: ты забил ${goals}!` : g >= 3 ? `Хет-трик! Ты забил ${goals}.` : g > 0 ? `Ты забил ${goals}.` : 'Сегодня без голов.';
  const record = [`${summary.wins} ${plural(summary.wins, 'победа', 'победы', 'побед')}`,
    ...(summary.draws ? [`${summary.draws} ${plural(summary.draws, 'ничья', 'ничьи', 'ничьих')}`] : []),
    ...(summary.losses ? [`${summary.losses} ${plural(summary.losses, 'поражение', 'поражения', 'поражений')}`] : [])].join(', ');
  return {
    html: [...teamTitle(view), `<b>Итоги матча · ${formatDateRu(view.date)}</b>`, headline,
      ...(summary.assists ? [`Голевые передачи: ${summary.assists}.`] : []),
      `Короткие игры: ${summary.games} — ${record}.`,
      ...(raised.length ? ['', ...raised.map(a => `<b>${a.level === 1 ? 'Новое достижение' : 'Новый уровень'}: «${a.title}», ${ACHIEVEMENT_TIER_LABEL[a.tier!].toLowerCase()}.</b> На счету ${a.current} ${plural(a.current, ...a.unit)}.`)] : []),
    ].join('\n'),
    keyboard: { inline_keyboard: [[{ text: 'Итоги матча', url: miniAppLink(env, `e${view.id}`) }, { text: 'Мои достижения', url: miniAppLink(env, 'settings') }]] },
  };
}

const AWARD_HEADLINE: Record<AwardKey, string> = {
  mvp: 'MVP матча — это ты', forward: 'Лучший нападающий матча — ты', midfielder: 'Лучший полузащитник матча — ты',
  defender: 'Лучший защитник матча — ты', goalkeeper: 'Лучший вратарь матча — ты',
};
const AWARD_OPENING: Record<AwardKey, readonly string[]> = {
  mvp: ['Партнёры назвали тебя лучшим игроком матча. Корона твоя до следующего MVP.', 'Главная награда вечера достаётся тебе. Заслуженно.',
    'Лучший игрок матча по голосам тех, кто был рядом на поле, — это ты.'],
  forward: ['Самый опасный у чужих ворот, по мнению партнёров, — ты.', 'Вратари соперников, кажется, уже в курсе.'],
  midfielder: ['Центр поля в этот вечер был твоим.', 'Партнёры отметили, как ты ведёшь игру.'],
  defender: ['Через тебя в этот вечер было не пройти.', 'Самый надёжный тыл вечера — твой.'],
  goalkeeper: ['Спасибо надёжным рукам: партнёры это заметили.', 'Последний рубеж держался благодаря тебе.'],
};
const COUNTED = ['', '', 'Две', 'Три', 'Четыре', 'Пять'];
const SHARED = ['', '', 'на двоих', 'на троих', 'на четверых', 'на пятерых'];
const LADDER: Record<'mvp' | 'position-best', { title: string; of: string }> = {
  mvp: { title: 'MVP', of: 'MVP' }, 'position-best': { title: 'Лучший на позиции', of: 'на позиции' },
};

function seedHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Поздравление победителю наград матча: одно сообщение на матч, даже если наград несколько. */
export function personalAwards(env: LinkEnv, view: EventView, v: {
  seed: string;
  awards: { award: AwardKey; votes: number; sharedWith: string[] }[];
  stats: CeremonyStats | null;
  progress: { ladder: 'mvp' | 'position-best'; total: number; raised: AchievementTier | null; nextTier: AchievementTier | null; remaining: number | null }[];
}): Rendered {
  const [main] = v.awards;
  const votes = (n: number) => `${n} ${plural(n, 'голос', 'голоса', 'голосов')}`;
  const title = v.awards.length > 1 ? `${COUNTED[v.awards.length] ?? v.awards.length} наград${v.awards.length > 4 ? '' : 'ы'} за матч` : AWARD_HEADLINE[main.award];
  const openings = AWARD_OPENING[main.award];
  const lines: string[] = [...teamTitle(view), `<b>🏆 ${title} · ${formatDateRu(view.date)}</b>`, openings[seedHash(v.seed) % openings.length]];
  if (v.awards.length > 1) lines.push(...v.awards.map(a => `${AWARD_LABEL[a.award]} — ${votes(a.votes)}`));
  else lines.push(`За тебя проголосовали ${main.votes} ${plural(main.votes, 'партнёр', 'партнёра', 'партнёров')}.`);
  for (const a of v.awards) if (a.sharedWith.length) {
    const names = ['ты', ...a.sharedWith.map(escapeHtml)];
    lines.push(`Награда ${SHARED[names.length] ?? `на ${names.length}`}: ${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}.`);
  }
  if (v.stats) {
    const s = v.stats;
    const parts = [`${s.goals} ${plural(s.goals, 'гол', 'гола', 'голов')}`, ...(s.assists ? [`${s.assists} ${plural(s.assists, 'пас', 'паса', 'пасов')}`] : []),
      `${s.wins} ${plural(s.wins, 'победа', 'победы', 'побед')} в ${s.games} ${plural(s.games, 'игре', 'играх', 'играх')}`];
    lines.push(`За матч: ${parts.join(', ')}.`);
  }
  const progress = v.progress.map(p => p.raised
    ? `Новый уровень: «${LADDER[p.ladder].title}», ${ACHIEVEMENT_TIER_LABEL[p.raised].toLowerCase()}.`
    : `Это твоя ${p.total}-я награда ${LADDER[p.ladder].of}.${p.nextTier && p.remaining ? ` ${ACHIEVEMENT_TIER_TO[p.nextTier]} — ещё ${p.remaining}.` : ''}`);
  if (progress.length) lines.push('', ...progress);
  return { html: lines.join('\n'), keyboard: { inline_keyboard: [[{ text: 'Посмотреть награды', url: miniAppLink(env, `e${view.id}`) }]] } };
}

function teamTitle(view: EventView): string[] {
  return view.communityTitle ? [escapeHtml(view.communityTitle), ''] : [];
}
