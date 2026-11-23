import { AWARD_LABEL, plural, type CeremonyCardDto, type CeremonyStats } from '@altynka/core';
import { useRef, useState } from 'react';
import { Avatar, Icon } from './Icon';

const SHARED = ['', '', 'на двоих', 'на троих'];

function statsLine(s: CeremonyStats): string {
  return [`${s.goals} ${plural(s.goals, 'гол', 'гола', 'голов')}`,
    ...(s.assists ? [`${s.assists} ${plural(s.assists, 'пас', 'паса', 'пасов')}`] : []),
    `${s.wins} ${plural(s.wins, 'победа', 'победы', 'побед')} из ${s.games}`].join(' · ');
}

/** «Награда на двоих · А и Б»; больше трёх — просто сколько игроков делят награду. */
function sharedLine(card: CeremonyCardDto, names: ReadonlyMap<number, string>): string {
  const all = [card.userId, ...card.sharedWith].sort((a, b) => a - b).map(id => names.get(id) ?? 'Игрок');
  if (all.length > 3) return `Награду делят ${all.length} игроков`;
  return `Награда ${SHARED[all.length]} · ${all.slice(0, -1).join(', ')} и ${all[all.length - 1]}`;
}

/**
 * The cards of a ceremony post: one per winner, swiped with native scroll snap or the arrows below.
 * A card opens the winner's profile; the post's own line above leads to the match.
 */
export function CeremonyCards({ cards, onOpen }: { cards: CeremonyCardDto[]; onOpen: (userId: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const names = new Map(cards.map(c => [c.userId, c.name]));
  const awardsOf = (userId: number) => cards.filter(c => c.userId === userId).length;
  function go(step: number) {
    const next = Math.max(0, Math.min(cards.length - 1, index + step));
    const node = track.current?.children[next] as HTMLElement | undefined;
    setIndex(next);
    if (node) track.current?.scrollTo({ left: node.offsetLeft - track.current.offsetLeft, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  return <div className="ceremony">
    <div className={`ceremony-cards${cards.length === 1 ? ' single' : ''}`} role="region" aria-label="Награды матча" ref={track} onScroll={e => {
      const el = e.currentTarget, width = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.clientWidth;
      setIndex(Math.max(0, Math.min(cards.length - 1, Math.round(el.scrollLeft / (width + 10)))));
    }}>
      {cards.map((card, i) => {
        const count = awardsOf(card.userId);
        return <div key={`${card.award}:${card.userId}`} role="group" aria-label={`${i + 1} из ${cards.length}`} className="ceremony-card" data-award={card.award}>
          <button type="button" className="ceremony-open" onClick={() => onOpen(card.userId)}>
            <span className="ceremony-award">{card.award === 'mvp' && <Icon name="crown" />}{AWARD_LABEL[card.award]}</span>
            <span className="ceremony-face"><Avatar name={card.name} photoUrl={card.photoUrl} large /></span>
            <b className="ceremony-name">{card.name}</b>
            <span className="ceremony-title">{card.title}</span>
            <span className="ceremony-text">{card.text}</span>
            {card.stats && <span className="ceremony-stats">{statsLine(card.stats)}</span>}
            <span className="ceremony-chips">
              <span className="ceremony-chip">{card.votes} {plural(card.votes, 'голос', 'голоса', 'голосов')}</span>
              {count > 1 && <span className="ceremony-chip">{count} {plural(count, 'награда', 'награды', 'наград')} за вечер</span>}
              {card.sharedWith.length > 0 && <span className="ceremony-chip">{sharedLine(card, names)}</span>}
            </span>
          </button>
        </div>;
      })}
    </div>
    {cards.length > 1 && <div className="carousel-controls ceremony-controls">
      <button type="button" className="carousel-arrow" onClick={() => go(-1)} disabled={index === 0} aria-label="Предыдущая награда"><Icon name="back" /></button>
      <span aria-live="polite">{index + 1} из {cards.length}</span>
      <button type="button" className="carousel-arrow" onClick={() => go(1)} disabled={index === cards.length - 1} aria-label="Следующая награда"><Icon name="back" className="chevron-right" /></button>
    </div>}
  </div>;
}
