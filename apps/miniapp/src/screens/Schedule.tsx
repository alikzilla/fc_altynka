import type { EventDetailDto } from '@altynka/core';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { api, ApiError } from '../lib/api';
import { openLink } from '../lib/tg';
import { findVenue, venueRate } from '../lib/venues';
import { creatableCommunities, useMe } from '../state/me';
import { EmptyState, ErrorNote, Loading, Screen, useToast } from '../components/ui';
import { ActionSheet } from '../components/ActionSheet';
import { Icon } from '../components/Icon';
import { VenuePicker } from '../components/VenuePicker';
import { TemporalInput } from '../components/TemporalInput';
import { useResource } from '../hooks/useResource';
import { useMatchPhase } from '../hooks/useMatchPhase';

export function Schedule({ eventId, onClose }: { eventId?: string; onClose?: () => void }) {
  const params = useParams<{ id: string }>();
  const id = eventId ?? params.id;
  const [, navigate] = useLocation();
  const me = useMe();
  const { data, error, reload } = useResource<EventDetailDto>(`/api/events/${id}`);
  const ev = useMatchPhase(data, reload);
  const close = onClose ?? (() => navigate(`/event/${id}`, { replace: true }));
  if (creatableCommunities(me).length === 0) return <Screen title="Назначить игру" back={`/event/${id}`}><EmptyState title="Игру назначает организатор" text="Время и место появятся в карточке матча после назначения." /></Screen>;
  const title = ev?.status === 'scheduled' ? 'Изменить время и поле' : 'Назначить игру';
  if (!ev || ev.status !== 'collecting' && ev.status !== 'scheduled') return <ActionSheet title={title} onClose={close}>
    {error && <ErrorNote text="Не получилось загрузить сбор" retry={reload} />}
    {!ev ? !error && <Loading variant="form" /> : <EmptyState title="Изменить время уже нельзя" text="Для матча со счётом, завершённого или отменённого матча назначение недоступно." />}
  </ActionSheet>;
  return <ScheduleDraft key={ev.id} ev={ev} onClose={close} />;
}

function ScheduleDraft({ ev, onClose }: { ev: EventDetailDto; onClose: () => void }) {
  const toast = useToast();
  const formId = useId();
  const locked = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [startTime, setStartTime] = useState(ev.startTime ?? '21:00');
  const [hours, setHours] = useState<1 | 2>(ev.durationHours ?? 1);
  const [place, setPlace] = useState(ev.place ?? '');
  const [picking, setPicking] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const venue = findVenue(place);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current) return;
    locked.current = true; setSaveError(null); setBusy(true);
    try {
      await api.send('POST', `/api/events/${ev.id}/schedule`, { startTime, durationHours: hours, place: place.trim() || undefined });
      if (!mounted.current) return;
      toast('Игра назначена, группа получила уведомление');
      onClose();
    } catch (err) {
      if (mounted.current) setSaveError(err instanceof ApiError && err.code === 'past_start' ? 'Выбери будущее время начала игры' : err instanceof ApiError && err.status === 409 ? 'Матч уже закрыт для изменений. Вернись к матчу, чтобы увидеть его состояние.' : 'Не получилось назначить игру. Данные сохранены — попробуй ещё раз.');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <>
    <ActionSheet title={ev.status === 'scheduled' ? 'Изменить время и поле' : 'Назначить игру'} onClose={onClose} busy={busy} className={`schedule-sheet${picking ? ' sheet-covered' : ''}`} footer={<button type="submit" form={formId} className="btn primary wide" disabled={busy}>{busy ? 'Сохраняем…' : ev.status === 'scheduled' ? 'Сохранить изменения' : 'Назначить игру'}</button>}>
      <form id={formId} className="form" onSubmit={submit}>
        <fieldset disabled={busy} className="form-fields">
          <label>Начало<TemporalInput type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} /></label>
          <fieldset className="form-fields"><legend className="schedule-field-label">Продолжительность</legend><div className="schedule-duration">
            {([1, 2] as const).map(h => <button type="button" key={h} className={`chip-btn${hours === h ? ' on' : ''}`} aria-pressed={hours === h} onClick={() => setHours(h)}><b>{h === 1 ? '1 час' : '2 часа'}</b><small>До {h === 1 ? 10 : 15} игроков</small></button>)}
          </div></fieldset>
          <div><span id={`${formId}-venue-label`} className="schedule-field-label">Место проведения <span>· необязательно</span></span>
            <button type="button" className={`venue-trigger${place ? ' has-place' : ''}`} aria-haspopup="dialog" aria-expanded={picking} aria-labelledby={`${formId}-venue-label ${formId}-venue-value`} onClick={e => { e.currentTarget.focus(); setPicking(true); }}>
              <Icon name="pin" /><span id={`${formId}-venue-value`}>{place || 'Выбрать площадку'}{venue && <small>{venue.address ?? 'Адрес уточняется'}</small>}</span><Icon name="back" className="venue-chevron" />
            </button>
            {venue && <div className="venue-summary"><a className="venue-map-link" href={venue.mapUrl} target="_blank" rel="noopener noreferrer" onClick={e => { e.preventDefault(); openLink(venue.mapUrl); }}>Открыть в 2ГИС <Icon name="arrow" /></a><span className="venue-rate">{venueRate(venue)}</span></div>}
          </div>
          <p className="muted">Участники получат время и место игры в уведомлении.</p>
        </fieldset>
        {saveError && <p className="field-error" role="alert">{saveError}</p>}
      </form>
    </ActionSheet>
    {picking && <VenuePicker place={place} onSelect={setPlace} onClose={() => setPicking(false)} />}
  </>;
}
