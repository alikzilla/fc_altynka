import type { VenueDto, VenuesDto } from '@altynka/core';
import { useId, useRef, useState } from 'react';
import { useResource } from '../hooks/useResource';
import { api, ApiError } from '../lib/api';
import { openLink } from '../lib/tg';
import { findVenue, mapLinkLabel, venueRate, venuesPath, withoutVenue, withVenueBack } from '../lib/venues';
import { ActionSheet } from './ActionSheet';
import { Icon } from './Icon';
import { ErrorNote, Sk, Skeleton } from './ui';

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
    setFailure(null);
    const index = venues?.findIndex(v => v.id === venue.id) ?? -1;
    replace(dto => withoutVenue(dto, venue.id)); setRemoving(null);
    try {
      await api.send<VenuesDto>('DELETE', `/api/venues/${venue.id}`);
    } catch {
      replace(dto => withVenueBack(dto, venue, index));
      setFailure(`Не получилось удалить площадку ${venue.name}. Попробуй ещё раз.`);
    }
  }

  // The add form is another step of the same sheet: it starts from its own height, not the list's.
  if (adding) return <ActionSheet title="Новая площадка" className="venue-sheet" onClose={() => setAdding(false)} busy={busy} step="add"
    footer={<button className="btn primary wide" type="submit" form={formId} disabled={busy}>{busy ? 'Сохраняем…' : 'Добавить площадку'}</button>}>
    <VenueForm formId={formId} communityId={communityId} busy={busy} setBusy={setBusy} onSaved={(dto, venue) => { replace(dto); setPicked(venue.name); setAdding(false); }} />
  </ActionSheet>;

  // The footer is there from the start, so the list arriving does not push it down.
  return <ActionSheet title="Место проведения" className="venue-sheet" onClose={onClose} busy={busy} step="list" footer={<>
    <p className="venue-selection-caption" aria-hidden={pending ? undefined : true}>{pending ? `Выбрано · ${pending.name}` : venues ? '\u00a0' : <Sk w="9em" />}</p>
    <button className="btn primary wide" type="button" disabled={busy || !pending} onClick={() => { if (!pending) return; onSelect(pending.name); onClose(); }}>Выбрать площадку</button>
  </>}>
    {error && !venues && <ErrorNote text="Не получилось загрузить площадки" retry={reload} />}
    {!venues && !error && <VenuePickerSkeleton />}
    {venues && <>
      <p className="muted venue-intro">{venues.length ? 'Выбери площадку для игры' : 'Площадок пока нет. Добавь поле, где вы играете: его можно будет выбирать для каждого матча.'}</p>
      {venues.length > 0 && <ul className="venue-options" aria-label="Площадки">
        {venues.map(venue => {
          const asking = removing === venue.id;
          // The card and its delete confirmation share one cell: asking does not make the row taller.
          return <li className={`venue-option${venue === pending ? ' selected' : ''}`} key={venue.id}><div className="sheet-stack venue-option-stack">
            <div className={asking ? 'sheet-stack-hidden' : undefined} inert={asking} aria-hidden={asking || undefined}>
              <button type="button" className="venue-select" aria-pressed={venue === pending} onClick={() => setPicked(venue.name)}>
                <span className="venue-info"><span className="venue-name">{venue.name}</span><span className="venue-address">{venue.address ?? 'Адрес уточняется'}</span></span>
                <span className="venue-check" aria-hidden="true">{venue === pending && <Icon name="check" />}</span>
              </button>
              <div className="venue-meta">
                {venue.mapUrl ? <VenueMapLink url={venue.mapUrl} /> : <span />}
                <span className="venue-rate">{venueRate(venue)}</span>
              </div>
              <button type="button" className="btn-text venue-remove-toggle" aria-label={`Удалить площадку ${venue.name}`} onClick={() => { setFailure(null); setRemoving(venue.id); }}>Удалить</button>
            </div>
            <div className={`venue-remove${asking ? '' : ' sheet-stack-hidden'}`} role="group" aria-label={`Удалить площадку ${venue.name}?`} inert={!asking} aria-hidden={!asking || undefined}>
              <p className="muted">Удалить площадку? Матчи, где она уже указана, не изменятся.</p>
              <div><button type="button" className="btn-text danger" disabled={busy} onClick={() => remove(venue)}>{busy ? 'Удаляем…' : 'Удалить'}</button><button type="button" className="btn-text" disabled={busy} onClick={() => setRemoving(null)}>Отмена</button></div>
            </div>
          </div></li>;
        })}
      </ul>}
      {failure && <p className="field-error" role="alert">{failure}</p>}
      <button type="button" className="btn wide venue-add" onClick={() => { setFailure(null); setRemoving(null); setAdding(true); }}><Icon name="plus" />Добавить площадку</button>
    </>}
  </ActionSheet>;
}

/** Каркас списка площадок: две карточки той же разметки и кнопка добавления. */
function VenuePickerSkeleton() {
  return <Skeleton>
    <p className="muted venue-intro">Выбери площадку для игры</p>
    <div className="venue-options">{[0, 1].map(index => <div className="venue-option" key={index}>
      <span className="venue-select"><span className="venue-info"><span className="venue-name"><Sk w={index ? '44%' : '58%'} /></span><span className="venue-address"><Sk w="72%" /></span></span><span className="venue-check" /></span>
      <div className="venue-meta"><span className="venue-map-link"><Sk w="8em" /></span><span className="venue-rate"><Sk w="6em" /></span></div>
      <span className="btn-text venue-remove-toggle">Удалить</span>
    </div>)}</div>
    <span className="btn wide venue-add sk-fill">Добавить площадку</span>
  </Skeleton>;
}

/** Форма площадки: без `venue` добавляет новую, с ним сохраняет правку. */
export function VenueForm({ formId, communityId, venue, busy, setBusy, onSaved }: { formId: string; communityId: number; venue?: VenueDto; busy: boolean; setBusy: (busy: boolean) => void; onSaved: (dto: VenuesDto, venue: VenueDto) => void }) {
  const [name, setName] = useState(venue?.name ?? '');
  const [address, setAddress] = useState(venue?.address ?? '');
  const [mapUrl, setMapUrl] = useState(venue?.mapUrl ?? '');
  const [rate, setRate] = useState(venue?.hourlyRate == null ? '' : String(venue.hourlyRate));
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current) return;
    const url = mapUrl.trim();
    if (url && !/^https:\/\/\S+$/.test(url)) { setError('Ссылка на карту должна начинаться с https://'); return; }
    locked.current = true; setBusy(true); setError(null);
    try {
      const saved = await api.send<VenuesDto & { venue: VenueDto }>(venue ? 'PATCH' : 'POST', venue ? `/api/venues/${venue.id}` : venuesPath(communityId), {
        name: name.trim(), address: address.trim() || null, mapUrl: url || null, hourlyRate: rate === '' ? null : Math.round(Number(rate)),
      });
      onSaved({ venues: saved.venues }, saved.venue);
    } catch (err) {
      setError(err instanceof ApiError && ADD_ERRORS[err.code] || (venue ? 'Не получилось сохранить площадку. Проверь соединение и попробуй ещё раз.' : 'Не получилось добавить площадку. Проверь соединение и попробуй ещё раз.'));
    } finally { locked.current = false; setBusy(false); }
  }
  return <form id={formId} className="form" onSubmit={submit}>
    <fieldset disabled={busy} className="form-fields">
      <label>Название<input required maxLength={80} placeholder="Например, Манеж на Толе би" value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Адрес · необязательно<input maxLength={120} placeholder="Улица и дом" value={address} onChange={e => setAddress(e.target.value)} /></label>
      <label>Ссылка на карту · необязательно<input inputMode="url" maxLength={300} placeholder="https://go.2gis.com/…" value={mapUrl} onChange={e => setMapUrl(e.target.value)} /></label>
      <label>Цена за час, ₸ · необязательно<input inputMode="numeric" type="number" min={0} max={10_000_000} step={1} value={rate} onChange={e => setRate(e.target.value)} /></label>
    </fieldset>
    <p className="muted">Площадку увидят все участники группы.</p>
    {/* «Такое название уже есть» is an ordinary outcome: its line is reserved, the other errors are rare. */}
    <div className="field-error-slot" data-sizer={ADD_ERRORS.duplicate}>{error && <p className="field-error" role="alert">{error}</p>}</div>
  </form>;
}
