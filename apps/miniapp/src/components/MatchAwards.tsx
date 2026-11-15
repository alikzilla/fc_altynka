import { AWARDS, AWARD_SHORT_LABEL, plural, type MatchAwardsDto } from '@altynka/core';
import { Fragment } from 'react';
import { Link } from 'wouter';

/** Winners of a closed vote. Only the winner's own count is shown; the full split never reaches the app. */
export function MatchAwards({ awards }: { awards: MatchAwardsDto }) {
  return <section className="card match-awards" aria-labelledby="match-awards-title">
    <h2 id="match-awards-title">Награды матча</h2>
    <ul>{AWARDS.map(key => {
      const award = awards[key];
      return <li key={key}>
        <span className="match-award-label">{AWARD_SHORT_LABEL[key]}</span>
        {award ? <>
          <span className="match-award-winners">{award.winners.map((person, i) => <Fragment key={person.userId}>
            {i > 0 && (i === award.winners.length - 1 ? ' и ' : ', ')}<Link href={`/players/${person.userId}`}>{person.name}</Link>
          </Fragment>)}</span>
          <span className="match-award-votes">{award.votes} {plural(award.votes, 'голос', 'голоса', 'голосов')}</span>
        </> : <span className="match-award-none">Недостаточно голосов</span>}
      </li>;
    })}</ul>
  </section>;
}
