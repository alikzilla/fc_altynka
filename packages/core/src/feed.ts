import { ACHIEVEMENT_TIER_LABEL, playerAchievements } from './achievements';
import type { CommunityDto } from './api';
import { plural } from './format';
import { calculateStandings, type GameResult, type GameRosterPlayer, type GameState } from './games';
import { aggregatePlayerStatistics, summarizePlayerProtocol, type PlayerProtocolSummary } from './playerStatistics';
import { teamAppearance, type TeamColor } from './teams';

/** Stories told after a finished match. */
export const FEED_MATCH_KINDS = ['winner', 'hero', 'hat_trick', 'scorer', 'assistant', 'duo', 'blowout', 'goal_fest', 'streak', 'summary',
  'achievement', 'debut', 'scoring_run', 'winning_run'] as const;
/** News about a match that is still ahead; they leave the feed once the match is played or cancelled. */
export const FEED_UPCOMING_KINDS = ['signup_open', 'scheduled', 'squad_full', 'teams_ready'] as const;
export const FEED_KINDS = [...FEED_MATCH_KINDS, 'top_rated', ...FEED_UPCOMING_KINDS] as const;
export type FeedKind = typeof FEED_KINDS[number];
export type FeedUpcomingKind = typeof FEED_UPCOMING_KINDS[number];

/** One reaction per person and post; choosing another replaces it, choosing the same again removes it. */
export const FEED_REACTIONS = ['fire', 'good', 'bad'] as const;
export type FeedReaction = typeof FEED_REACTIONS[number];
export const FEED_REACTION_EMOJI: Record<FeedReaction, string> = { fire: '🔥', good: '👍', bad: '👎' };
export const FEED_REACTION_LABEL: Record<FeedReaction, string> = { fire: 'Огонь', good: 'Нравится', bad: 'Не нравится' };
export interface FeedReactionsDto { reactions: Record<FeedReaction, number>; myReaction: FeedReaction | null }

export interface FeedPostDto extends FeedReactionsDto {
  id: number; kind: FeedKind; text: string;
  /** Names inside `text` that the interface emphasises. */
  highlights: string[];
  createdAt: number; eventId: number; eventDate: string; community: CommunityDto;
  userId: number | null; teamColor: TeamColor | null;
  /** The player the post is about, shown as its author line; null for team and match news. */
  player: { userId: number; name: string; photoUrl: string | null } | null;
}
export interface FeedDto { posts: FeedPostDto[] }

/** A post ready to store; `slot` is unique within its match, `variant` is the phrasing that was used. */
export interface FeedDraft {
  kind: FeedKind; slot: string; variant: number; text: string; highlights: string[];
  userId: number | null; teamColor: TeamColor | null;
}
/** Phrasings recently used in the group, newest first, so the next post of that kind sounds different. */
export type RecentVariants = Partial<Record<FeedKind, readonly number[]>>;

export const FEED_MATCH_LIMIT = 6;
const RECENT_DEPTH = 4;

/*
 * Правила текстов. Имена игроков и названия команд подставляются как есть, поэтому стоят только
 * в именительном падеже. Пол игрока неизвестен: о людях пишем в настоящем времени или без глагола.
 * Команды («Красные») во множественном числе, прошедшее время допустимо. По имени только хвалим;
 * шутки достаются счёту и командам. «Матч» — вся встреча, «игра» — короткая игра внутри неё.
 */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

class Voice {
  private readonly used = new Map<FeedKind, number[]>();
  constructor(private readonly seed: string, recent: RecentVariants = {}) {
    for (const kind of FEED_KINDS) this.used.set(kind, [...recent[kind] ?? []]);
  }
  /** Stable for the same match and slot; skips phrasings the group has just read. */
  say(kind: FeedKind, slot: string, offset: number, lines: readonly string[]): { variant: number; text: string } {
    const used = this.used.get(kind)!;
    const avoid = new Set(used.slice(0, Math.min(RECENT_DEPTH, lines.length - 1)));
    const free = lines.map((_, i) => i + offset).filter(v => !avoid.has(v));
    const variant = free[hash(`${this.seed}:${slot}`) % free.length];
    used.unshift(variant);
    return { variant, text: lines[variant - offset] };
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (names: readonly string[]) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
const goalsWord = (n: number) => plural(n, 'гол', 'гола', 'голов');
const goals = (n: number) => `${n} ${goalsWord(n)}`;
const passes = (n: number) => `${n} ${plural(n, 'передача', 'передачи', 'передач')}`;
const gamesAcc = (n: number) => `${n} ${plural(n, 'игру', 'игры', 'игр')}`;
const gamesNom = (n: number) => `${n} ${plural(n, 'игра', 'игры', 'игр')}`;
const gamesLoc = (n: number) => `${n} ${plural(n, 'игре', 'играх', 'играх')}`;
const winsWord = (n: number) => `${n} ${plural(n, 'победа', 'победы', 'побед')}`;
const matchesRun = (n: number) => `${n} ${plural(n, 'матч', 'матча', 'матчей')}`;
const points = (n: number) => `${n} ${plural(n, 'очко', 'очка', 'очков')}`;
const times = (n: number) => `${n} ${plural(n, 'раз', 'раза', 'раз')}`;
const decimal = (n: number) => n.toFixed(1).replace('.', ',');

/** '2026-11-07' → '7 ноября' */
export function formatDayMonthRu(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00Z`));
}
const weekdayDate = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00Z`));

interface Candidate { kind: FeedKind; slot: string; score: number; offset?: number; lines: readonly string[]; highlights: string[]; userId?: number | null; teamColor?: TeamColor | null }

interface PlayerLine { player: GameRosterPlayer; goals: number; assists: number }

function playerLines(state: GameState): PlayerLine[] {
  const rows = new Map(state.roster.map(player => [player.signupId, { player, goals: 0, assists: 0 }]));
  for (const game of state.games) {
    for (const s of game.scorers) { const row = rows.get(s.signupId); if (row) row.goals += s.goals; }
    for (const a of game.assists ?? []) { const row = rows.get(a.assistSignupId); if (row) row.assists += a.goals; }
  }
  return [...rows.values()];
}

function winnerStory(state: GameState, team: (i: number) => { name: string; key: TeamColor }): Candidate | null {
  const table = calculateStandings(state.teamCount, state.games);
  const leaders = table.filter(row => row.rank === 1);
  const first = table[0];
  if (leaders.length > 1) {
    const names = leaders.map(row => team(row.teamIndex).name);
    const all = list(names);
    return { kind: 'winner', slot: 'winner', score: 100, offset: 40, highlights: names, lines: [
      `Победителя нет: ${all} закончили матч вровень.`,
      `${all} делят первое место. Редкий случай полного равенства.`,
      `Матч без победителя: ${all} не уступили друг другу ни очка, ни мяча.`,
      `Поровну и по очкам, и по мячам: ${all} так и не выяснили, кто сильнее.`,
    ] };
  }
  const T = team(first.teamIndex).name;
  const base = { kind: 'winner' as const, slot: 'winner', score: 100, teamColor: team(first.teamIndex).key };
  const second = table[1];
  if (state.games.length === 1) {
    const [a, b] = [...state.games[0].score].sort((x, y) => y - x);
    const S = team(second.teamIndex).name;
    return { ...base, offset: 30, highlights: [T, S], lines: [
      `${T} выиграли матч со счётом ${a}:${b}.`,
      `Итог матча: ${T} сильнее, ${a}:${b}.`,
      `${a}:${b}. Победу празднуют ${T}.`,
      `Одна игра, один победитель: ${T}, ${a}:${b}.`,
    ] };
  }
  const record = [first.wins && winsWord(first.wins), first.draws && `${first.draws} ${plural(first.draws, 'ничья', 'ничьи', 'ничьих')}`,
    first.losses && `${first.losses} ${plural(first.losses, 'поражение', 'поражения', 'поражений')}`].filter(Boolean).join(', ');
  const difference = `${first.goalDifference > 0 ? '+' : ''}${first.goalDifference}`;
  if (second.points === first.points) {
    const S = team(second.teamIndex).name;
    return { ...base, offset: 20, highlights: [T, S], lines: [
      `${T} и ${S} набрали поровну очков. По мячам первые ${T}.`,
      `Плотная концовка: у двух команд по ${points(first.points)}. Первые ${T}, всё решили мячи.`,
      `${T} первые, но с минимальным запасом: ${S} отстали только по мячам.`,
      `Фотофиниш в таблице: ${T} выше только по разнице мячей.`,
      `Очков поровну, но таблица не знает жалости: ${T} первые, ${S} вторые.`,
    ] };
  }
  if (!first.losses && !first.draws) return { ...base, offset: 10, highlights: [T], lines: [
    `${T} не оставили шансов: ${winsWord(first.wins)} из ${first.wins}.`,
    `Идеальный матч: ${T} выиграли все ${gamesAcc(first.wins)}.`,
    `${T} выиграли всё, что можно было выиграть: ${first.wins} из ${first.wins}.`,
    `Без осечек: ${T} взяли ${winsWord(first.wins)} в ${gamesLoc(first.wins)}.`,
    `${cap(gamesNom(first.wins))}, ${winsWord(first.wins)}. Это ${T}.`,
    `Сто процентов побед: ${T} никому ничего не отдали.`,
  ] };
  if (!first.losses) return { ...base, offset: 50, highlights: [T], lines: [
    `${T} выиграли матч и ни разу не проиграли: ${record}.`,
    `Ни одного поражения: ${T} заслуженно первые. В активе ${record}.`,
    `${T} прошли матч без поражений и забрали первое место.`,
    `${T} остались непобеждёнными: ${record}.`,
    `Проиграть ${T} так и не согласились: ${record}, первое место.`,
  ] };
  return { ...base, highlights: [T], lines: [
    `${T} выиграли матч: ${record}.`,
    `Первое место: ${T}. В активе ${record}.`,
    `${T} забрали этот матч: ${points(first.points)} в ${gamesLoc(first.played)}.`,
    `Таблицу возглавили ${T}: ${record}.`,
    `${T} оказались сильнее всех: ${points(first.points)} и разница мячей ${difference}.`,
    `Чемпионы матча: ${T}. ${cap(record)}.`,
    `${T} уходят с поля первыми в таблице: ${record}.`,
    `Кто молодцы? ${T}. ${cap(record)}.`,
  ] };
}

function personalStories(state: GameState): Candidate[] {
  const rows = playerLines(state);
  const out: Candidate[] = [];
  const total = (r: PlayerLine) => r.goals + r.assists;
  const involved = rows.filter(r => r.goals >= 1 && r.assists >= 1 && total(r) >= 3).sort((a, b) => total(b) - total(a) || b.goals - a.goals);
  const hero = involved[0] && (!involved[1] || total(involved[0]) > total(involved[1]) || involved[0].goals > involved[1].goals) ? involved[0] : null;
  if (hero) {
    const N = hero.player.name;
    const line = `${hero.goals === 3 ? 'хет-трик' : goals(hero.goals)} и ${passes(hero.assists)}`;
    out.push({ kind: 'hero', slot: 'hero', score: 95 + total(hero), highlights: [N], userId: hero.player.userId, lines: [
      `${N} — герой матча: ${line}.`,
      `${cap(line)}. Это всё ${N}.`,
      `${N} везде успевает: ${line}.`,
      `Лучший по системе «гол плюс пас»: ${N}, ${line}.`,
      `${N} и забивает, и отдаёт: ${line}.`,
      `Где гол, там ${N}. Где передача, тоже ${N}. Итог: ${line}.`,
      `${N} участвует в ${total(hero)} ${plural(total(hero), 'голе', 'голах', 'голах')} своей команды: ${line}.`,
      `Звание героя матча получает ${N}: ${line}.`,
    ] });
  }
  for (const row of rows.filter(r => r.goals >= 3 && r !== hero)) {
    const N = row.player.name, g = row.goals;
    out.push({ kind: 'hat_trick', slot: `hat_trick:${row.player.signupId}`, score: 90 + g, highlights: [N], userId: row.player.userId,
      offset: g === 3 ? 0 : 20, lines: g === 3 ? [
        `Хет-трик! ${N} забивает трижды.`,
        `${N} оформляет хет-трик. Вратари просят больше так не делать.`,
        `Три гола за матч: ${N} уносит мяч домой.`,
        `${N} и три мяча в чужих воротах. Хет-трик.`,
        `Автор хет-трика: ${N}.`,
        `Раз, два, три: ${N} с хет-триком.`,
        `На табло трижды одно имя: ${N}.`,
        `Мяч на память забирает ${N}: хет-трик.`,
      ] : [
        `${cap(goals(g))} за матч! ${N} не остановить.`,
        `${N} забивает ${goals(g)}. Это уже не хет-трик, это больше.`,
        `${cap(goals(g))} от одного игрока: ${N}. Защитникам сочувствуем.`,
        `${N} и ${goals(g)} за один матч. Запишите в историю.`,
        `${N} перевыполняет план по хет-трикам: ${goals(g)}.`,
      ] });
  }
  const best = Math.max(0, ...rows.map(r => r.goals));
  const top = rows.filter(r => r.goals === best);
  if (best === 2 && top.length <= 3 && !top.includes(hero!)) {
    const names = top.map(r => r.player.name);
    if (top.length === 1) out.push({ kind: 'scorer', slot: 'scorer', score: 58, highlights: names, userId: top[0].player.userId, lines: [
      `Дубль оформляет ${names[0]}. Это лучший результат матча.`,
      `${names[0]} забивает дважды и становится лучшим бомбардиром матча.`,
      `Два гола и первое место среди бомбардиров: ${names[0]}.`,
      `Лучший бомбардир матча: ${names[0]}, два гола.`,
      `${names[0]} дважды находит ворота. Больше не забил никто.`,
      `Дубль матча: ${names[0]}.`,
      `${names[0]} с дублем. Скромно, но больше ни у кого.`,
    ] });
    else out.push({ kind: 'scorer', slot: 'scorer', score: 56, offset: 20, highlights: names, lines: [
      `Дубли оформляют ${list(names)}.`,
      `По два гола забивают ${list(names)}. Бомбардиры матча определены.`,
      `Лучшие бомбардиры матча: ${list(names)}, по два гола.`,
      `${list(names)}: у каждого по дублю.`,
    ] });
  }
  const givers = rows.filter(r => r.assists >= 3 && r !== hero).sort((a, b) => b.assists - a.assists);
  if (givers[0] && givers[0].assists > (givers[1]?.assists ?? 0)) {
    const N = givers[0].player.name, a = givers[0].assists;
    const full = `${a} ${plural(a, 'голевая передача', 'голевые передачи', 'голевых передач')}`;
    out.push({ kind: 'assistant', slot: 'assistant', score: 57 + a, highlights: [N], userId: givers[0].player.userId, lines: [
      `Лучший ассистент матча: ${N}, ${full}.`,
      `${N} кормит партнёров передачами: ${full}.`,
      `${cap(full)} от одного игрока: ${N} щедрее всех.`,
      `Последний пас чаще всего отдаёт ${N}: ${full}.`,
      `${N} видит поле лучше всех: ${full}.`,
      `Забивать приятно, но кто-то должен отдавать. ${N}: ${full}.`,
    ] });
  }
  return out;
}

function duoStory(state: GameState): Candidate | null {
  const pairs = new Map<string, { from: number; to: number; goals: number }>();
  for (const game of state.games) for (const a of game.assists ?? []) {
    const key = `${a.assistSignupId}:${a.scorerSignupId}`;
    const row = pairs.get(key) ?? { from: a.assistSignupId, to: a.scorerSignupId, goals: 0 };
    row.goals += a.goals; pairs.set(key, row);
  }
  const both = (p: { from: number; to: number; goals: number }) => p.goals + (pairs.get(`${p.to}:${p.from}`)?.goals ?? 0);
  const best = [...pairs.values()].sort((a, b) => both(b) - both(a) || b.goals - a.goals || a.from - b.from)[0];
  if (!best || both(best) < 2) return null;
  const P = state.roster.find(p => p.signupId === best.from)?.name, S = state.roster.find(p => p.signupId === best.to)?.name;
  if (!P || !S) return null;
  const n = both(best);
  const shared = `${n} ${plural(n, 'совместный гол', 'совместных гола', 'совместных голов')}`;
  const base = { kind: 'duo' as const, slot: 'duo', score: 65 + n, highlights: [P, S] };
  if (n > best.goals) return { ...base, offset: 20, lines: [
    `Дуэт матча: ${P} и ${S}. ${cap(shared)}, и пасы шли в обе стороны.`,
    `${P} и ${S} понимают друг друга без слов: ${shared}.`,
    `${P} и ${S} по очереди отдают и забивают: ${shared}.`,
  ] };
  return { ...base, lines: [
    `Связка матча: ${P} отдаёт, ${S} забивает. И так ${times(n)}.`,
    `${P} и ${S} нашли друг друга: ${goals(n)} по одной схеме.`,
    `${P} пасует, ${S} забивает. Повторить ${times(n)}.`,
    `Дуэт матча: ${P} и ${S}, ${shared}.`,
    `${cap(goals(n))} по одному рецепту: пас даёт ${P}, бьёт ${S}.`,
    `${P} и ${S} понимают друг друга без слов: ${shared}.`,
  ] };
}

function gameStories(state: GameState, team: (i: number) => { name: string; key: TeamColor }, perfectWinner: number | null): Candidate[] {
  const out: Candidate[] = [];
  const margin = (g: GameResult) => Math.abs(g.score[0] - g.score[1]);
  const sum = (g: GameResult) => g.score[0] + g.score[1];
  // One game is the whole match, and the winner post already tells its score.
  const games = state.games.length > 1 ? state.games : [];
  const rout = [...games].sort((a, b) => margin(b) - margin(a) || sum(b) - sum(a) || a.sequence - b.sequence)[0];
  if (rout && margin(rout) >= 3) {
    const side = rout.score[0] > rout.score[1] ? 0 : 1;
    const W = team(rout.pair[side]), L = team(rout.pair[1 - side]);
    const a = rout.score[side], b = rout.score[1 - side], n = rout.sequence;
    out.push({ kind: 'blowout', slot: 'blowout', score: 55 + margin(rout) * 3, highlights: [W.name, L.name], teamColor: W.key, lines: [
      `${a}:${b} в игре ${n}. ${W.name} не притормаживали.`,
      `Самая крупная победа матча: ${W.name} — ${L.name}, ${a}:${b}.`,
      `${W.name} устроили разгром в игре ${n}: ${a}:${b}.`,
      `Игра ${n} получилась в одни ворота: ${a}:${b}, праздновали ${W.name}.`,
      `${a}:${b}. ${W.name} в игре ${n} забивали всё, что летело к воротам.`,
      `Крупный счёт матча: ${a}:${b}. Отличились ${W.name}.`,
    ] });
  }
  const rich = [...games].filter(g => g !== rout || margin(g) < 3).sort((a, b) => sum(b) - sum(a) || a.sequence - b.sequence)[0];
  if (rich && sum(rich) >= 6) {
    const A = team(rich.pair[0]).name, B = team(rich.pair[1]).name, [a, b] = rich.score, n = rich.sequence;
    out.push({ kind: 'goal_fest', slot: 'goal_fest', score: 50 + sum(rich), highlights: [A, B], lines: [
      `Игра ${n} выдалась щедрой: ${a}:${b}, ${goals(sum(rich))} на двоих.`,
      `${cap(goals(sum(rich)))} в одной игре: ${A} — ${B}, ${a}:${b}.`,
      `Вратарям в игре ${n} было не до отдыха: ${a}:${b}.`,
      `Самая результативная игра матча: ${A} — ${B}, ${a}:${b}.`,
      `Голевая перестрелка в игре ${n}: ${a}:${b}.`,
    ] });
  }
  let run: { teamIndex: number; length: number } | null = null;
  for (let teamIndex = 0; teamIndex < state.teamCount; teamIndex++) {
    let current = 0;
    for (const game of state.games) {
      const side = game.pair.indexOf(teamIndex);
      if (side < 0) continue;
      current = game.score[side] > game.score[1 - side] ? current + 1 : 0;
      if (current >= 3 && current > (run?.length ?? 0)) run = { teamIndex, length: current };
    }
  }
  // A perfect winner already says "all N games won".
  if (run && run.teamIndex !== perfectWinner) {
    const T = team(run.teamIndex), n = run.length;
    out.push({ kind: 'streak', slot: 'streak', score: 62 + n, highlights: [T.name], teamColor: T.key, lines: [
      `${T.name} выиграли ${gamesAcc(n)} подряд.`,
      `Серия матча: ${T.name}, ${winsWord(n)} подряд.`,
      `${T.name} поймали кураж: ${winsWord(n)} подряд.`,
      `${cap(gamesNom(n))} без единой осечки: ${T.name} выдали лучшую серию матча.`,
      `${T.name} завелись и взяли ${gamesAcc(n)} подряд.`,
      ...(state.teamCount === 3 ? [`${T.name} не уходили с поля ${gamesAcc(n)} подряд.`] : []),
    ] });
  }
  const all = state.games.reduce((n, g) => n + sum(g), 0), count = state.games.length;
  if (count > 1) out.push({ kind: 'summary', slot: 'summary', score: 30, highlights: [], offset: all ? 0 : 20, lines: all ? [
    `За матч сыграли ${gamesAcc(count)} и забили ${goals(all)}.`,
    `Матч в цифрах: ${gamesNom(count)}, ${goals(all)}.`,
    `${cap(goals(all))} в ${gamesLoc(count)}. В среднем ${decimal(all / count)} за игру.`,
    `Статистика матча: ${gamesNom(count)} и ${goals(all)}. Мячи целы, ворота тоже.`,
    `Сыграно: ${gamesNom(count)}. Забито: ${goals(all)}. Расходимся до следующего матча.`,
  ] : [
    `${cap(gamesNom(count))} и ни одного гола. Вратари могут гордиться.`,
    `Матч без голов: ${gamesNom(count)}, и все всухую.`,
  ] });
  return out;
}

const RUN_MARKS = (n: number) => n === 3 || n === 5 || n === 7 || n >= 10 && n % 5 === 0;

function progressStories(state: GameState, previous: readonly GameState[]): Candidate[] {
  const out: Candidate[] = [];
  const played = previous.filter(s => s.games.length > 0);
  const soleWinner = (s: GameState) => { const top = calculateStandings(s.teamCount, s.games).filter(r => r.rank === 1); return top.length === 1 ? top[0].teamIndex : null; };
  const winners = new Map<GameState, number | null>();
  const winnerOf = (s: GameState) => { if (!winners.has(s)) winners.set(s, soleWinner(s)); return winners.get(s)!; };
  const debuts: Candidate[] = [], scoring: (Candidate & { run: number })[] = [], winning: (Candidate & { run: number })[] = [];
  for (const player of state.roster) {
    if (player.userId === null) continue;
    const userId = player.userId, N = player.name;
    const now = summarizePlayerProtocol(state, userId);
    if (!now.games) continue;
    const past: { state: GameState; summary: PlayerProtocolSummary }[] = played
      .map(s => ({ state: s, summary: summarizePlayerProtocol(s, userId) })).filter(row => row.summary.games > 0);
    if (!past.length) {
      const g = now.goals;
      if (played.length) debuts.push({ kind: 'debut', slot: `debut:${userId}`, score: g ? 72 : 50, highlights: [N], userId, offset: g ? 0 : 20, lines: g ? [
        g === 1 ? `Дебют с голом: ${N} забивает в первом же матче.` : `${N} дебютирует и сразу забивает ${goals(g)}.`,
        `Первый матч и сразу ${goals(g)}: ${N}, добро пожаловать.`,
        `Новичок с заявкой: ${N}, ${goals(g)} в дебютном матче.`,
        `${N} не тратит время на знакомство: ${goals(g)} в первом матче.`,
      ] : [
        `${N} играет первый матч с нами. Добро пожаловать!`,
        `В команде пополнение: ${N} проводит дебютный матч.`,
        `Первый матч в группе: ${N}. Дальше будет больше.`,
        `${N} открывает счёт своим матчам. Пока один, но это только начало.`,
      ] });
    }
    const before = playerAchievements(aggregatePlayerStatistics(past.map(row => row.summary)));
    const after = playerAchievements(aggregatePlayerStatistics([...past.map(row => row.summary), now]));
    const raised = after.filter((a, i) => a.level > before[i].level && a.level >= 2).sort((a, b) => b.level - a.level)[0];
    if (raised?.tier) {
      const tier = ACHIEVEMENT_TIER_LABEL[raised.tier].toLowerCase();
      const amount = `${raised.current} ${plural(raised.current, ...raised.unit)}`;
      out.push({ kind: 'achievement', slot: `achievement:${userId}`, score: 60 + raised.level * 5, highlights: [N], userId, lines: [
        `${N} получает достижение «${raised.title}», уровень «${tier}». На счету ${amount}.`,
        `Новый уровень: ${N} теперь «${raised.title}», ${tier}. Уже ${amount}, и счёт идёт дальше.`,
        `${cap(tier)} в достижении «${raised.title}»: ${N}, ${amount}.`,
        `${N} берёт новую высоту: «${raised.title}», ${tier}. Уже ${amount}.`,
        `${cap(amount)} за всё время. ${N} открывает уровень «${tier}» в достижении «${raised.title}».`,
        `Коллекция пополняется: ${N}, «${raised.title}», ${tier}.`,
      ] });
    }
    const history = [...past, { state, summary: now }].reverse();
    const goalRun = history.findIndex(row => row.summary.goals === 0);
    const k = goalRun < 0 ? history.length : goalRun;
    if (RUN_MARKS(k)) scoring.push({ run: k, kind: 'scoring_run', slot: 'scoring_run', score: 66 + k, highlights: [N], userId, lines: [
      `${N} забивает в ${k}-м матче подряд.`,
      `Серия продолжается: ${N} не уходит без гола уже ${matchesRun(k)} подряд.`,
      `${cap(matchesRun(k))} подряд с голами: ${N} держит марку.`,
      `${N} и голы: ${k}-й матч подряд вместе.`,
      `Стабильность: ${N} забивает ${matchesRun(k)} подряд.`,
    ] });
    const lost = history.findIndex(row => winnerOf(row.state) !== row.state.roster.find(p => p.userId === userId)?.teamIndex);
    const w = lost < 0 ? history.length : lost;
    if (RUN_MARKS(w)) winning.push({ run: w, kind: 'winning_run', slot: 'winning_run', score: 56 + w, highlights: [N], userId, lines: [
      `${N} выигрывает ${w}-й матч подряд. Команды меняются, результат нет.`,
      `Талисман? ${N} в команде-победителе ${matchesRun(w)} подряд.`,
      `${cap(matchesRun(w))} подряд в составе победителей: ${N}.`,
      `${N}: ${matchesRun(w)} подряд на первом месте. Делите составы осторожнее.`,
    ] });
  }
  // A whole squad of newcomers is not news; neither is half the winning team on the same run.
  if (debuts.length <= 3) out.push(...debuts);
  const longest = <T extends { run: number }>(rows: T[]) => rows.sort((a, b) => b.run - a.run)[0];
  if (scoring.length) out.push(longest(scoring));
  if (winning.length) out.push(longest(winning));
  return out;
}

const KIND_CAPS: Partial<Record<FeedKind, number>> = { achievement: 2, debut: 2, hat_trick: 2 };

export interface MatchFeedInput {
  eventId: number; state: GameState; colors?: readonly string[] | null;
  /** Earlier played matches of the same group, oldest first. */
  previous?: readonly GameState[];
  recent?: RecentVariants;
}

/** The few most telling stories of a finished match, the winner first. */
export function composeMatchFeed({ eventId, state, colors, previous = [], recent }: MatchFeedInput): FeedDraft[] {
  if (!state.games.length) return [];
  const team = (i: number) => teamAppearance(i, colors);
  const winner = winnerStory(state, team);
  const table = calculateStandings(state.teamCount, state.games);
  const perfect = table[0].played > 1 && table[0].wins === table[0].played && table.filter(r => r.rank === 1).length === 1 ? table[0].teamIndex : null;
  const duo = duoStory(state);
  const candidates = [winner, ...personalStories(state), duo, ...gameStories(state, team, perfect), ...progressStories(state, previous)]
    .filter((c): c is Candidate => c !== null).sort((a, b) => b.score - a.score || a.slot.localeCompare(b.slot));
  const taken = new Map<FeedKind, number>();
  const chosen: Candidate[] = [];
  for (const c of candidates) {
    if (chosen.length >= FEED_MATCH_LIMIT) break;
    const count = taken.get(c.kind) ?? 0;
    if (count >= (KIND_CAPS[c.kind] ?? 1)) continue;
    // Bare numbers only fill a quiet match.
    if (c.kind === 'summary' && chosen.length >= 3) continue;
    taken.set(c.kind, count + 1); chosen.push(c);
  }
  const voice = new Voice(String(eventId), recent);
  return chosen.map(c => draft(voice, c));
}

function draft(voice: Voice, c: Candidate): FeedDraft {
  const { variant, text } = voice.say(c.kind, c.slot, c.offset ?? 0, c.lines);
  return { kind: c.kind, slot: c.slot, variant, text, highlights: c.highlights.filter(name => name && text.includes(name)), userId: c.userId ?? null, teamColor: c.teamColor ?? null };
}

/** The best-rated player once anonymous voting has closed; more than two leaders is not a story. */
export function composeTopRatedPost(v: { eventId: number; date: string; winners: readonly { userId: number; name: string }[]; score: number; recent?: RecentVariants }): FeedDraft | null {
  if (!v.winners.length || v.winners.length > 2) return null;
  const d = formatDayMonthRu(v.date), s = decimal(v.score);
  const [A, B] = v.winners.map(w => w.name);
  return draft(new Voice(String(v.eventId), v.recent), v.winners.length === 1 ? { kind: 'top_rated', slot: 'top_rated', score: 0, highlights: [A], userId: v.winners[0].userId, lines: [
    `Голосование закрыто. Лучший игрок матча ${d}: ${A}, средняя оценка ${s}.`,
    `${A} получает самую высокую оценку за матч ${d}: ${s}.`,
    `По оценкам партнёров лучший в матче ${d}: ${A}, ${s} из 10.`,
    `Оценки за матч ${d} подсчитаны. Первое место: ${A}, ${s} из 10.`,
    `Выбор игроков за матч ${d}: ${A}. Средняя оценка ${s}.`,
    `Партнёры оценили матч ${d}. Выше всех ${A}: ${s}.`,
  ] } : { kind: 'top_rated', slot: 'top_rated', score: 0, offset: 20, highlights: [A, B], lines: [
    `Оценки за матч ${d} подсчитаны: ${A} и ${B} делят первое место, ${s} из 10.`,
    `Игроки не смогли выбрать одного: ${A} и ${B}, по ${s} за матч ${d}.`,
    `Лучших двое: ${A} и ${B} получили одинаковую оценку за матч ${d}, ${s}.`,
  ] });
}

export interface UpcomingFeedInput {
  eventId: number; date: string; startTime?: string | null; place?: string | null; limit?: number;
  teamCount?: number | null; colors?: readonly string[] | null; recent?: RecentVariants;
}

export function composeUpcomingPost(kind: FeedUpcomingKind, v: UpcomingFeedInput): FeedDraft {
  const D = weekdayDate(v.date), d = formatDayMonthRu(v.date);
  const where = v.place ? `, ${v.place}` : '';
  const n = v.limit ?? 0;
  const teams = Array.from({ length: v.teamCount ?? 0 }, (_, i) => teamAppearance(i, v.colors).name);
  const lines: Record<FeedUpcomingKind, readonly string[]> = {
    signup_open: [
      `Открыта запись на матч: ${D}.`,
      `Новый матч в расписании: ${D}. Запись открыта.`,
      `Собираемся снова: ${D}. Записывайся, пока есть места.`,
      `${cap(D)}: играем. Запись уже идёт.`,
      `Кто на футбол? ${cap(D)}, запись открыта.`,
      `В календаре появился матч: ${D}. Места в основе не бесконечные.`,
    ],
    scheduled: [
      `Матч ${d} начнётся в ${v.startTime}${where}.`,
      `Время известно: ${D}, ${v.startTime}${v.place ? `. Поле: ${v.place}` : ''}.`,
      `${cap(D)}, ${v.startTime}${where}. Не опаздываем.`,
      `Назначено: играем ${d} в ${v.startTime}${where}.`,
      `Сверяем часы: ${d}, ${v.startTime}${where}.`,
    ],
    squad_full: [
      `Состав на матч ${d} собран: ${n} из ${n}.`,
      `Основа на ${d} заполнена. Дальше только резерв.`,
      `Мест в основе на матч ${d} больше нет. Резерв открыт.`,
      `${n} из ${n}: состав на ${d} укомплектован.`,
      `Аншлаг: на матч ${d} записались все ${n}.`,
    ],
    teams_ready: [
      `Составы на матч ${d} опубликованы. Смотри, за кого играешь.`,
      `Команды на ${d} поделены: ${list(teams)}.`,
      `Известны составы на ${d}. Кто против кого, уже в приложении.`,
      `Жеребьёвка позади: составы на матч ${d} готовы.`,
      `${list(teams)}: составы на ${d} опубликованы.`,
    ],
  };
  return draft(new Voice(String(v.eventId), v.recent), { kind, slot: kind, score: 0, lines: lines[kind], highlights: kind === 'teams_ready' ? teams : [] });
}
