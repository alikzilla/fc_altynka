import { TEAMS } from '@altynka/core';

export function GameTeamName({ index }: { index: number }) {
  const team = TEAMS[index];
  return <span className={`game-team-name team-${team.key}`}><span className="team-dot" aria-hidden="true" />{team.name}</span>;
}
