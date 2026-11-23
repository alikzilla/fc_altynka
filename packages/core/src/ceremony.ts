import { playerAchievements, type AchievementTier } from './achievements';
import type { AwardKey } from './awards';
import { plural } from './format';
import { aggregatePlayerStatistics } from './playerStatistics';

/** Цифры победителя за матч по записанным играм; `assists` — null, если пасы не записывали. */
export interface CeremonyStats { goals: number; assists: number | null; games: number; wins: number }
/** Карточка церемонии, как она хранится в `feed_posts.payload_json`: без имени и фото, они берутся при чтении. */
export interface CeremonyCard { award: AwardKey; userId: number; title: string; text: string; votes: number; stats: CeremonyStats | null; sharedWith: number[] }
export interface CeremonyCardDto extends CeremonyCard { name: string; photoUrl: string | null }
export interface CeremonyWinner { award: AwardKey; userId: number; name: string; votes: number; stats: CeremonyStats | null; sharedWith: number[] }

/** Титул под именем на карточке. */
export const CEREMONY_TITLES: Record<AwardKey, readonly string[]> = {
  mvp: ['Главный герой вечера', 'Человек матча', 'Лицо вечера'],
  forward: ['Гроза ворот', 'Острие атаки', 'Снайпер вечера'],
  midfielder: ['Мозг команды', 'Дирижёр', 'Мотор центра поля'],
  defender: ['Стена', 'Замок обороны', 'Надёжный тыл'],
  goalkeeper: ['Последний рубеж', 'Надёжные руки', 'Хозяин штрафной'],
};

const dayMonth = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00Z`));
const votesWord = (n: number) => `${n} ${plural(n, 'голос', 'голоса', 'голосов')}`;
const goalsWord = (n: number) => `${n} ${plural(n, 'гол', 'гола', 'голов')}`;
const passesWord = (n: number) => `${n} ${plural(n, 'пас', 'паса', 'пасов')}`;
const winsWord = (n: number) => `${n} ${plural(n, 'победа', 'победы', 'побед')}`;

/**
 * Формулировки карточки по правилам ленты: имя только в именительном падеже, о человеке — в настоящем
 * времени. Строки с цифрами добавляются к общим, только когда цифры есть о чём рассказать.
 */
export function ceremonyLines(award: AwardKey, v: { name: string; date: string; votes: number; stats: CeremonyStats | null }): readonly string[] {
  const A = v.name, d = dayMonth(v.date), s = v.stats;
  const goals = s?.goals ?? 0, assists = s?.assists ?? 0, wins = s?.wins ?? 0;
  // Только ненулевые цифры: «3 паса», а не «0 голов и 3 паса».
  const numbers = [...(goals > 0 ? [goalsWord(goals)] : []), ...(assists > 0 ? [passesWord(assists)] : [])];
  const both = numbers.join(' и '), listed = numbers.join(', ');
  switch (award) {
    case 'mvp': return [
      `${A} — MVP матча ${d}. Партнёры отдали голоса, и спорить тут не о чем.`,
      `Лучший игрок вечера по версии тех, кто был на поле: ${A}.`,
      `Есть игроки, вокруг которых крутится весь матч. ${d} это ${A}.`,
      `${A} забирает главный приз вечера. ${votesWord(v.votes)}, и все заслуженные.`,
      `Если пересказывать матч ${d} одним именем, это имя — ${A}.`,
      `Новый обладатель короны: ${A}. Она остаётся у хозяина до следующего MVP.`,
      ...(s && goals + assists >= 3 ? [
        `${both} за вечер. ${A} делает матч ${d} своим и забирает MVP.`,
        `Цифры и голоса совпали: ${listed} и звание MVP. Это ${A}.`,
      ] : []),
    ];
    case 'forward': return [
      `Защитники ещё долго будут вспоминать этот вечер. Лучший нападающий матча ${d}: ${A}.`,
      `${A} — самый опасный человек у чужих ворот.`,
      `Каждый выход один на один — как приговор. Лучший нападающий: ${A}.`,
      `Острие атаки матча ${d}: ${A}.`,
      `Вратари соперников выдыхают: матч позади. Лучший нападающий вечера — ${A}.`,
      ...(s && goals >= 2 ? [
        `${A} — ${goalsWord(goals)} за вечер и лучший нападающий матча ${d}.`,
        `${goalsWord(goals)} на счету и награда лучшего нападающего. ${A} в форме.`,
      ] : []),
    ];
    case 'midfielder': return [
      `Все атаки начинаются с одного человека. Лучший полузащитник матча ${d}: ${A}.`,
      `В центре поля в этот вечер хозяин один: ${A}.`,
      `Пас, отбор, снова пас. ${A} — лучший полузащитник вечера.`,
      `Связующее звено матча ${d}: ${A}.`,
      `Голы забивают другие, а матч строит ${A}.`,
      ...(s && assists >= 2 ? [
        `${passesWord(assists)}, и каждый как подарок. ${A} — лучший полузащитник матча.`,
        `${A} раздаёт ${passesWord(assists)} за вечер. Лучший в центре поля.`,
      ] : []),
    ];
    case 'defender': return [
      `Через эту зону в этот вечер не пройти. Лучший защитник матча ${d}: ${A}.`,
      `${A} — стена, о которую разбиваются атаки.`,
      `Нападающие соперников ищут обход, а там снова ${A}.`,
      `Надёжнее обороны в этот вечер не было. Лучший защитник: ${A}.`,
      `Тихая, незаметная, бесценная работа. Лучший защитник матча ${d}: ${A}.`,
      ...(s && wins >= 2 ? [`${winsWord(wins)}, и в каждой надёжный тыл. ${A} — лучший защитник вечера.`] : []),
    ];
    case 'goalkeeper': return [
      `Последний рубеж держится. Лучший вратарь матча ${d}: ${A}.`,
      `${A} — руки, которым партнёры доверяют больше всего.`,
      `Чтобы забить, надо было пройти не только защиту. Ещё и ${A}.`,
      `Нападающие соперников запомнят этот вечер: в воротах стоит ${A}.`,
      `Лучший вратарь вечера по голосам партнёров: ${A}.`,
      ...(s && wins >= 2 ? [`${winsWord(wins)} за вечер, и за каждой стоят надёжные руки. Лучший вратарь: ${A}.`] : []),
    ];
  }
}

/** Где игрок на лестнице наград после этого матча: открытый им уровень или сколько осталось до следующего. */
export function awardProgress(ladder: 'mvp' | 'position-best', total: number, won: number):
  { total: number; raised: AchievementTier | null; nextTier: AchievementTier | null; remaining: number | null } {
  const at = (count: number) => playerAchievements({ ...aggregatePlayerStatistics([]), ...(ladder === 'mvp' ? { mvps: count } : { positionAwards: count }) })
    .find(a => a.id === ladder)!;
  const now = at(total), before = at(Math.max(0, total - won));
  return { total, raised: now.level > before.level ? now.tier : null, nextTier: now.nextTier,
    remaining: now.nextTarget === null ? null : now.nextTarget - total };
}
