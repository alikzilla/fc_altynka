import { AWARDS, AWARD_SHORT_LABEL, plural, type AwardKey, type MatchAwardsDto } from '@altynka/core';
import { Fragment } from 'react';
import { Link } from 'wouter';
import { Avatar, Icon } from './Icon';

type Award = MatchAwardsDto[AwardKey];

/** «А», «А и Б», «А, Б и В» — every winner is a link to the profile. */
function Winners({ award }: { award: NonNullable<Award> }) {
  return <span className="match-award-winners">{award.winners.map((person, i) => <Fragment key={person.userId}>
    {i > 0 && (i === award.winners.length - 1 ? ' и ' : ', ')}<Link href={`/players/${person.userId}`}>{person.name}</Link>
  </Fragment>)}</span>;
}

const votes = (award: NonNullable<Award>) => <span className="match-award-votes">{award.votes} {plural(award.votes, 'голос', 'голоса', 'голосов')}</span>;

/**
 * Winners of a closed vote: the MVP in a gold card, the four positions as tiles below.
 * Only the winner's own count is shown; the full split never reaches the app.
 */
export function MatchAwards({ awards }: { awards: MatchAwardsDto }) {
  const mvp = awards.mvp;
  return <section className="card match-awards" aria-labelledby="match-awards-title">
    <h2 id="match-awards-title">Награды матча</h2>
    <div className={`match-award-hero${mvp ? '' : ' empty'}`}>
      {mvp && <span className="match-award-faces" aria-hidden="true">{mvp.winners.slice(0, 3).map(p => <Avatar key={p.userId} name={p.name} photoUrl={p.photoUrl} />)}</span>}
      <span className="match-award-hero-copy">
        <span className="match-award-label"><Icon name="crown" />{AWARD_SHORT_LABEL.mvp}</span>
        {mvp ? <><Winners award={mvp} />{votes(mvp)}</> : <span className="match-award-none">Недостаточно голосов</span>}
      </span>
    </div>
    <ul className="match-award-tiles">{AWARDS.filter(key => key !== 'mvp').map(key => {
      const award = awards[key];
      return <li key={key} className={`match-award-tile${award ? '' : ' empty'}`} data-award={key}>
        <span className="match-award-label">{AWARD_SHORT_LABEL[key]}</span>
        {award ? <>
          {award.winners.length === 1 && <span className="match-award-face" aria-hidden="true"><Avatar name={award.winners[0].name} photoUrl={award.winners[0].photoUrl} /></span>}
          <Winners award={award} />{votes(award)}
        </> : <span className="match-award-none">Недостаточно голосов</span>}
      </li>;
    })}</ul>
  </section>;
}
