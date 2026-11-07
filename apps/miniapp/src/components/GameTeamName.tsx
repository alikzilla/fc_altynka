import { teamAppearance, type TeamColor } from '@altynka/core';

export function GameTeamName({ index, colors }: { index: number; colors?: readonly TeamColor[] }) {
  const team = teamAppearance(index, colors);
  return <span className={`game-team-name team-${team.key}`}><span className="team-dot" aria-hidden="true" />{team.name}</span>;
}
