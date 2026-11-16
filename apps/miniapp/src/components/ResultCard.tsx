import { formatDateRu, formatTenge, plural, type EventSummaryDto, type MyMatchResult, type NotificationTaskDto } from '@altynka/core';
import { Fragment } from 'react';
import { Link } from 'wouter';
import { Icon } from './Icon';

const PLACE = ['первое', 'второе', 'третье'];

/** The night closes on one big answer — your team's place — then the record, your goals and what is left to do. */
export function ResultCard({ event, result, tasks }: { event: EventSummaryDto; result: MyMatchResult; tasks: readonly NotificationTaskDto[] }) {
  const payment = tasks.find(t => t.kind === 'payment' && t.eventId === event.id);
  const review = tasks.find(t => t.kind === 'review' && t.eventId === event.id);
  const record = [
    `${result.wins} ${plural(result.wins, 'победа', 'победы', 'побед')}`,
    `${result.draws} ${plural(result.draws, 'ничья', 'ничьи', 'ничьих')}`,
    `${result.losses} ${plural(result.losses, 'поражение', 'поражения', 'поражений')}`,
  ];
  return <article className="card material-plum result-card" aria-label={`Итог матча: ${PLACE[result.teamRank - 1] ?? PLACE[2]} место`}>
    <p className="match-day result-card-date">{formatDateRu(event.date)}</p>
    <h2 className="match-headline">{result.teamRank} место</h2>
    <p className="match-when">{record.map((part, i) => <Fragment key={part}>{i ? ' · ' : ''}<span className="nowrap">{part}</span></Fragment>)}</p>
    <div className="match-tags">
      <span className="match-tag"><Icon name="ball" />{result.goals ? `${result.goals} ${plural(result.goals, 'твой гол', 'твоих гола', 'твоих голов')}` : 'Без голов'}</span>
      <span className="match-tag">{result.games} {plural(result.games, 'игра', 'игры', 'игр')}</span>
    </div>
    <div className="result-card-actions">
      {payment?.kind === 'payment' && <Link className="btn primary wide" href={`/event/${event.id}?tab=bill`}>Оплатить {formatTenge(payment.due)}<Icon name="arrow" /></Link>}
      {review && <Link className={`btn wide ${payment ? '' : 'primary'}`} href={`/event/${event.id}/review`}>Оценить матч<Icon name="arrow" /></Link>}
      <Link className="btn-text result-card-link" href={`/event/${event.id}?tab=games`}>Таблица и бомбардиры<Icon name="arrow" /></Link>
    </div>
  </article>;
}
