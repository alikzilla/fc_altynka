import { formatDateRu, formatRating, SKILLS, type PlayerProfileDto, type PlayerRatingDto } from '@altynka/core';
import { Link } from 'wouter';
import { GroupTag } from './GroupTag';

export function InlineRating({ rating }: { rating: PlayerRatingDto }) {
  return <div className="profile-inline-rating" role="group" aria-label="Рейтинг игрока">
    <div><span>Игровой рейтинг</span><small>{rating.matchesCount ? `Учтено матчей: ${rating.matchesCount}` : rating.selfAssessment ? 'По стартовой анкете' : 'Пока предварительный'}</small></div>
    <strong><span>{formatRating(rating.value)}</span><span className="rating-denominator"> / 10</span></strong>
  </div>;
}

export function RatingSummary({ rating }: { rating: PlayerRatingDto }) {
  return <section className="card material-blue rating-summary" aria-label="Общий рейтинг">
    <div className="rating-summary-top"><h2>Игровой рейтинг</h2><span className="muted">из 10</span></div>
    <strong className="rating-number">{formatRating(rating.value)}</strong>
    <p className="muted">{rating.matchesCount > 0 ? `Учтено матчей: ${rating.matchesCount} из последних 10` : rating.selfAssessment ? 'Стартовый рейтинг по анкете' : 'Предварительный уровень · анкета не заполнена'}</p>
    {rating.matchesCount > 0 && <p className="muted">Стартовая оценка — {formatRating(rating.initial)}. Матчи постепенно уточняют уровень.</p>}
  </section>;
}

export function SkillBreakdown({ rating }: { rating: PlayerRatingDto }) {
  if (!rating.selfAssessment) return null;
  return <section className="card skill-breakdown" aria-labelledby="self-assessment-title">
    <h2 id="self-assessment-title">Самооценка</h2>
    <p className="muted">Характеристики из анкеты. Оценки матчей уточняют общий рейтинг.</p>
    <dl className="skill-meters">{SKILLS.map(skill => <div key={skill.key}>
      <dt>{skill.label}</dt><dd>{rating.selfAssessment![skill.key]}<span className="muted"> / 10</span></dd>
      <dd className="skill-meter-track"><meter min={0} max={10} value={rating.selfAssessment![skill.key]} aria-label={skill.label} /></dd>
    </div>)}</dl>
  </section>;
}

export function RatingHistory({ history }: { history: PlayerProfileDto['history'] }) {
  return <section className="rating-history"><h2>Последние матчи</h2>
    {history.length ? <ul className="card list">{history.map(item => <li key={item.eventId}>
      <Link className="rating-history-row" href={`/event/${item.eventId}`}><span><GroupTag community={item.community} />{formatDateRu(item.date)}{item.place && <small className="muted">{item.place}</small>}</span>
        <span className={item.score === null ? 'muted rating-insufficient' : 'rating-small'}>{item.score === null ? 'Недостаточно оценок' : formatRating(item.score)}</span></Link>
    </li>)}</ul> : <p className="muted">Здесь появятся оценки после сыгранных матчей и завершения голосования.</p>}
  </section>;
}
