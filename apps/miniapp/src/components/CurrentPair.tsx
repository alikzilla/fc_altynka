import { plural, teamAppearance, type GameProtocolDto } from '@altynka/core';
import { Fragment, type ReactNode } from 'react';
import { Sk } from './ui';

type Colors = Parameters<typeof teamAppearance>[1];

/**
 * The current pair in its short form, shared by the games tab and the game screen: an optional lead («Игра N»
 * with the live mark) and the rest or kickoff chip on the top line, then both teams on one line with a small kit
 * disc, name and points, «VS» between them.
 */
export function CurrentPair({ protocol, colors, lead }: { protocol: GameProtocolDto; colors: Colors; lead?: ReactNode }) {
  const pointsOf = (team: number) => protocol.standings.find(t => t.teamIndex === team)?.points ?? 0;
  const kickoff = protocol.teamCount === 2 && !protocol.games.length ? protocol.kickoffTeamIndex ?? null : null;
  const chip = protocol.restingTeamIndex !== null ? { team: protocol.restingTeamIndex, text: 'Отдыхают' } : kickoff !== null ? { team: kickoff, text: 'С мячом начинают' } : null;
  return <>
    {(lead || chip) && <div className="game-current-top">
      {lead}
      {chip && <p className={`game-rest team-${teamAppearance(chip.team, colors).key}`}><span className="team-dot" aria-hidden="true" />{chip.text} {teamAppearance(chip.team, colors).name}</p>}
    </div>}
    <div className="game-versus">{protocol.currentPair!.map((team, i) => <Fragment key={team}>
      {i === 1 && <span className="game-vs" aria-hidden="true">VS</span>}
      <div className={`game-side team-${teamAppearance(team, colors).key}`}>
        <span className="game-kit" aria-hidden="true" />
        <span className="game-side-name"><b>{teamAppearance(team, colors).name}</b><small>{pointsOf(team)} {plural(pointsOf(team), 'очко', 'очка', 'очков')}</small></span>
      </div>
    </Fragment>)}</div>
  </>;
}

/** The same lines as placeholders, so the loaded card takes their place without moving. */
export function CurrentPairSkeleton({ lead = false }: { lead?: boolean }) {
  return <>
    <div className="game-current-top">{lead && <span className="game-current-meta"><Sk w="4em" /></span>}<p className="game-rest"><Sk w="8em" /></p></div>
    <div className="game-versus">{[0, 1].map(side => <Fragment key={side}>
      {side === 1 && <span className="game-vs">VS</span>}
      <div className="game-side"><span className="game-kit sk-fill" /><span className="game-side-name"><b><Sk w="4.5em" /></b><small><Sk w="3em" /></small></span></div>
    </Fragment>)}</div>
  </>;
}
