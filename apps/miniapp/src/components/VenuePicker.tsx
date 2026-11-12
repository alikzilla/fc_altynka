import type { VenueDto, VenuesDto } from '@altynka/core';
import { useId, useRef, useState } from 'react';
import { useResource } from '../hooks/useResource';
import { api, ApiError } from '../lib/api';
import { openLink } from '../lib/tg';
import { findVenue, mapLinkLabel, venueRate, venuesPath } from '../lib/venues';
import { ActionSheet } from './ActionSheet';
import { Icon } from './Icon';
import { ErrorNote } from './ui';

const ADD_ERRORS: Record<string, string> = {
  duplicate: 'Площадка с таким названием уже есть',
  too_many: 'Площадок слишком много. Удали лишнюю и попробуй ещё раз.',
  invalid: 'Проверь поля: ссылка должна начинаться с https://',
};

export function VenueMapLink({ url }: { url: string }) {
  return <a className="venue-map-link" href={url} target="_blank" rel="noopener noreferrer" onClick={e => { e.preventDefault(); openLink(url); }}>{mapLinkLabel(url)} <Icon name="arrow" /></a>;
}

/** Выбор площадки группы. Организатор здесь же добавляет новые поля и удаляет ненужные. */
export function VenuePicker({ communityId, place, onSelect, onClose }: { communityId: number; place: string; onSelect: (place: string) => void; onClose: () => void }) {
  const { data, error, reload, replace } = useResource<VenuesDto>(venuesPath(communityId));
  const venues = data?.venues;
  const [picked, setPicked] = useState(place);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const formId = useId();
  const pending = findVenue(venues, picked) ?? venues?.[0];

  async function remove(venue: VenueDto) {
    setBusy(true); setFailure(null);
    try {
      replace(await api.send<VenuesDto>('DELETE', `/api/venues/${venue.id}`));
      setRemoving(null);
    } catch {
      setFailure('Не получилось удалить площадку. Попробуй ещё раз.');
    } finally { setBusy(false); }
  }

  if (adding) return <ActionSheet title="Новая площадка" className="venue-sheet" onClose={() => setAdding(false)} busy={busy}
    footer={<button className="btn primary wide" type="submit" form={formId} disabled={busy}>{busy ? 'Сохраняем…' : 'Добавить площадку'}</button>}>
    <VenueForm formId={formId} communityId={communityId} busy={busy} setBusy={setBusy} onAdded={(dto, venue) => { replace(dto); setPicked(venue.name); setAdding(false); }} />
  </ActionSheet>;

  return <ActionSheet title="Место проведения" className="venue-sheet" onClose={onClose} busy={busy} footer={pending && <>
    <p className="venue-selection-caption">Выбрано · {pending.name}</p>
    <button className="btn primary wide" type="button" disabled={busy} onClick={() => { onSelect(pending.name); onClose(); }}>Выбрать площадку</button>
  </>}>
    {error && !venues && <ErrorNote text="Не получилось загрузить площадки" retry={reload} />}
    {venues && <>
      <p className="muted venue-intro">{venues.length ? 'Выбери площадку для игры' : 'Площадок пока нет. Добавь поле, где вы играете: его можно будет выбирать для каждого матча.'}</p>
      {venues.length > 0 && <ul className="venue-options" aria-label="Площадки">
        {venues.map(venue => <li className={`venue-option${venue === pending ? ' selected' : ''}`} key={venue.id}>
          <button type="button" className="venue-select" aria-pressed={venue === pending} onClick={() => setPicked(venue.name)}>
            <span className="venue-info"><span className="venue-name">{venue.name}</span><span className="venue-address">{venue.address ?? 'Адрес уточняется'}</span></span>
            <span className="venue-check" aria-hidden="true">{venue === pending && <Icon name="check" />}</span>
          </button>
          <div className="venue-meta">
            {venue.mapUrl ? <VenueMapLink url={venue.mapUrl} /> : <span />}
            <span className="venue-rate">{venueRate(venue)}</span>
          </div>
          {removing === venue.id
            ? <div className="venue-remove" role="group" aria-label={`Удалить площадку ${venue.name}?`}>
                <p className="muted">Удалить площадку? Матчи, где она уже указана, не изменятся.</p>
                <div><button type="button" className="btn-text danger" disabled={busy} onClick={() => remove(venue)}>{busy ? 'Удаляем…' : 'Удалить'}</button><button type="button" className="btn-text" disabled={busy} onClick={() => setRemoving(null)}>Отмена</button></div>
              </div>
            : <button type="button" className="btn-text venue-remove-toggle" aria-label={`Удалить площадку ${venue.name}`} onClick={() => { setFailure(null); setRemoving(venue.id); }}>Удалить</button>}
        </li>)}
      </ul>}
      {failure && <p className="field-error" role="alert">{failure}</p>}
      <button type="button" className="btn wide venue-add" onClick={() => { setFailure(null); setRemoving(null); setAdding(true); }}><Icon name="plus" />Добавить площадку</button>
    </>}
  </ActionSheet>;
}

function VenueForm({ formId, communityId, busy, setBusy, onAdded }: { formId: string; communityId: number; busy: boolean; setBusy: (busy: boolean) => void; onAdded: (dto: VenuesDto, venue: VenueDto) => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [rate, setRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current) return;
    const url = mapUrl.trim();
    if (url && !/^https:\/\/\S+$/.test(url)) { setError('Ссылка на карту должна начинаться с https://'); return; }
    locked.current = true; setBusy(true); setError(null);
    try {
      const saved = await api.send<VenuesDto & { venue: VenueDto }>('POST', venuesPath(communityId), {
        name: name.trim(), address: address.trim() || null, mapUrl: url || null, hourlyRate: rate === '' ? null : Math.round(Number(rate)),
      });
      onAdded({ venues: saved.venues }, saved.venue);
    } catch (err) {
      setError(err instanceof ApiError && ADD_ERRORS[err.code] || 'Не получилось добавить площадку. Проверь соединение и попробуй ещё раз.');
    } finally { locked.current = false; setBusy(false); }
  }
  return <form id={formId} className="form" onSubmit={submit}>
    <fieldset disabled={busy} className="form-fields">
      <label>Название<input required maxLength={80} placeholder="Например, Манеж на Толе би" value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Адрес · необязательно<input maxLength={120} placeholder="Улица и дом" value={address} onChange={e => setAddress(e.target.value)} /></label>
      <label>Ссылка на карту · необязательно<input inputMode="url" maxLength={300} placeholder="https://go.2gis.com/…" value={mapUrl} onChange={e => setMapUrl(e.target.value)} /></label>
      <label>Цена за час, ₸ · необязательно<input inputMode="numeric" type="number" min={0} max={10_000_000} step={1} value={rate} onChange={e => setRate(e.target.value)} /></label>
    </fieldset>
    <p className="muted">Площадку увидят все организаторы группы.</p>
    {error && <p className="field-error" role="alert">{error}</p>}
  </form>;
}
