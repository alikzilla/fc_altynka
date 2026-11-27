import { useHeroMaterial } from '../lib/heroMaterial';
import { plural, summarizePlayerProtocol, teamAppearance, type GameProtocolDto, type GameState } from '@altynka/core';

type Colors = Parameters<typeof teamAppearance>[1];

/** «за Синих»: team names are plural adjectives, so the genitive swaps the ending. */
const forTeam = (name: string) => name.replace(/ые$/, 'ых').replace(/ие$/, 'их');
/** Block height by place: the winner stands tallest; teams that share a place share a height. */
const HEIGHT: Record<number, number> = { 1: 74, 2: 52, 3: 34 };

/**
 * A finished match: a podium of the teams in their colours with points on the steps (the winner in the middle,
 * places from the standings, so ties share a step) and the viewer's own line under it when they played.
 */
export function MatchPodium({ protocol, colors, userId }: { protocol: GameProtocolDto; colors: Colors; userId: number }) {
  const rows = protocol.standings;
  // Three teams stand 2-1-3; two teams stand 1-2.
  const order = rows.length === 3 ? [rows[1], rows[0], rows[2]] : rows;
  const me = protocol.roster.find(p => p.userId === userId);
  // The summary reads only the roster and the games, which the protocol carries.
  const mine = me ? summarizePlayerProtocol({ roster: protocol.roster, games: protocol.games } as unknown as GameState, userId) : null;
  const games = protocol.games.length;
  const hero = useHeroMaterial('material-blue');
  return <section className={`card ${hero.className} match-podium`} style={hero.style} aria-labelledby="match-podium-heading">
    <div className="match-podium-head"><h2 id="match-podium-heading">Итоги матча</h2><p className="muted">{games} {plural(games, 'игра', 'игры', 'игр')}</p></div>
    <ol className="podium" aria-label="Места команд">{order.map(row => {
      const team = teamAppearance(row.teamIndex, colors);
      return <li key={row.teamIndex} className={`podium-step team-${team.key}${row.rank === 1 ? ' first' : ''}`} aria-label={`${row.rank} место: ${team.name}, ${row.points} ${plural(row.points, 'очко', 'очка', 'очков')}`}>
        <span className="game-kit" aria-hidden="true" />
        <span className="podium-name" aria-hidden="true">{team.name}</span>
        <span className="podium-block" style={{ height: HEIGHT[row.rank] ?? 34 }} aria-hidden="true">{row.points}</span>
      </li>;
    })}</ol>
    {me && mine && <p className={`podium-me team-${teamAppearance(me.teamIndex, colors).key}`}><span className="team-dot" aria-hidden="true" />Ты за {forTeam(teamAppearance(me.teamIndex, colors).name)} · {mine.wins}–{mine.draws}–{mine.losses} · {mine.goals} {plural(mine.goals, 'гол', 'гола', 'голов')}</p>}
  </section>;
}
