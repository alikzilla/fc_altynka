import { plural, type ReviewPlayerStats } from '@altynka/core';

/** Что игрок сделал за матч: четыре плитки в шаге оценки, число над подписью. Пасы до их учёта — «—», как в профиле. */
export function ReviewStatTiles({ stats }: { stats: ReviewPlayerStats }) {
  const results = `${stats.wins} ${plural(stats.wins, 'победа', 'победы', 'побед')}, ${stats.draws} ${plural(stats.draws, 'ничья', 'ничьи', 'ничьих')}, ${stats.losses} ${plural(stats.losses, 'поражение', 'поражения', 'поражений')}`;
  return <ul className="review-stats" aria-label="За этот матч">
    <li className="review-stat-goals"><strong>{stats.goals}</strong> <span>{plural(stats.goals, 'гол', 'гола', 'голов')}</span></li>
    <li><strong>{stats.assistsTracked ? stats.assists : '—'}</strong> <span>{stats.assistsTracked ? plural(stats.assists, 'пас', 'паса', 'пасов') : 'пасы не записаны'}</span></li>
    <li><strong>{stats.games}</strong> <span>{plural(stats.games, 'игра', 'игры', 'игр')}</span></li>
    <li><strong aria-hidden="true">{stats.wins}·{stats.draws}·{stats.losses}</strong> <span aria-hidden="true">В · Н · П</span><span className="sr-only">{results}</span></li>
  </ul>;
}

/** Короткая строка для списка выбора награды: «2 гола · 1 пас». Ничего не сделал — «без голов». */
export function reviewStatsLine(stats: ReviewPlayerStats): string {
  const parts: string[] = [];
  // Неразрывный пробел держит число рядом со словом, переносится только между частями.
  if (stats.goals) parts.push(`${stats.goals}\u00a0${plural(stats.goals, 'гол', 'гола', 'голов')}`);
  if (stats.assistsTracked && stats.assists) parts.push(`${stats.assists}\u00a0${plural(stats.assists, 'пас', 'паса', 'пасов')}`);
  return parts.length ? parts.join(' · ') : stats.assistsTracked ? 'без голов и пасов' : 'без голов';
}
