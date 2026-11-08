import { formatDateRu, formatTenge, plural, teamAppearance, type EventSummaryDto, type MyMatchResult, type NotificationTaskDto } from '@altynka/core';
import { Link } from 'wouter';
import { GroupTag } from './GroupTag';
import { Icon } from './Icon';

/** The night closes on the scoreline: your team, its place and your goals; paying and rating follow. */
export function ResultCard({ event, result, tasks }: { event: EventSummaryDto; result: MyMatchResult; tasks: readonly NotificationTaskDto[] }) {
  const team = teamAppearance(result.teamIndex, result.colors);
  const payment = tasks.find(t => t.kind === 'payment' && t.eventId === event.id);
  const review = tasks.find(t => t.kind === 'review' && t.eventId === event.id);
  const place = result.teamRank === 1 ? 'первое место' : result.teamRank === 2 ? 'второе место' : 'третье место';
  return <article className="card material-plum result-card" aria-labelledby={`result-${event.id}`}>
    <div className="result-card-meta"><GroupTag community={event.community} /><span>{formatDateRu(event.date)}{event.place ? ` · ${event.place}` : ''}</span></div>
    <h2 id={`result-${event.id}`} className={`result-card-team team-${team.key}`}><span className="team-dot" aria-hidden="true" />{team.name} — {place}</h2>
    <dl className="result-card-stats">
      <div><dt>{plural(result.wins, 'победа', 'победы', 'побед')}</dt><dd>{result.wins}</dd></div>
      <div><dt>{plural(result.draws, 'ничья', 'ничьи', 'ничьих')}</dt><dd>{result.draws}</dd></div>
      <div><dt>{plural(result.losses, 'поражение', 'поражения', 'поражений')}</dt><dd>{result.losses}</dd></div>
      <div className="result-card-goals"><dt>{result.goals ? plural(result.goals, 'твой гол', 'твоих гола', 'твоих голов') : 'голов пока нет'}</dt><dd>{result.goals || '—'}</dd></div>
    </dl>
    <p className="result-card-note">{plural(result.games, 'Сыграна', 'Сыграно', 'Сыграно')} {result.games} {plural(result.games, 'игра', 'игры', 'игр')} · команд в матче: {result.teamCount}</p>
    <div className="result-card-actions">
      {payment?.kind === 'payment' && <Link className="btn primary wide" href={`/event/${event.id}?tab=bill`}>Оплатить {formatTenge(payment.due)}<Icon name="arrow" /></Link>}
      {review && <Link className={`btn wide ${payment ? '' : 'primary'}`} href={`/event/${event.id}/review`}>Оценить матч<Icon name="arrow" /></Link>}
      <Link className="btn-text result-card-link" href={`/event/${event.id}?tab=games`}>Таблица и бомбардиры<Icon name="arrow" /></Link>
    </div>
  </article>;
}
