import { useState } from 'react';
import { openLink } from '../lib/tg';
import { findVenue, VENUES, venueRate } from '../lib/venues';
import { ActionSheet } from './ActionSheet';
import { Icon } from './Icon';

export function VenuePicker({ place, onSelect, onClose }: { place: string; onSelect: (place: string) => void; onClose: () => void }) {
  const [pending, setPending] = useState(() => findVenue(place) ?? VENUES[0]!);
  return <ActionSheet title="Место проведения" className="venue-sheet" onClose={onClose} footer={<>
    <p className="venue-selection-caption">Выбрано · {pending.name}</p>
    <button className="btn primary wide" type="button" onClick={() => { onSelect(pending.name); onClose(); }}>Выбрать площадку</button>
  </>}>
    <p className="muted venue-intro">Выбери площадку для игры</p>
    <ul className="venue-options" aria-label="Площадки">
      {VENUES.map(venue => <li className={`venue-option${venue === pending ? ' selected' : ''}`} key={venue.name}>
        <button type="button" className="venue-select" aria-pressed={venue === pending} onClick={() => setPending(venue)}>
          <span className="venue-info"><span className="venue-name">{venue.name}</span><span className="venue-address">{venue.address ?? 'Адрес уточняется'}</span></span>
          <span className="venue-check" aria-hidden="true">{venue === pending && <Icon name="check" />}</span>
        </button>
        <div className="venue-meta">
          <a className="venue-map-link" href={venue.mapUrl} target="_blank" rel="noopener noreferrer" onClick={e => { e.preventDefault(); openLink(venue.mapUrl); }}>Открыть в 2ГИС <Icon name="arrow" /></a>
          <span className="venue-rate">{venueRate(venue)}</span>
        </div>
      </li>)}
    </ul>
  </ActionSheet>;
}
