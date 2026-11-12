import { MATCH_FORMATS, limitFor, matchFormat, plural, type EventDetailDto, type MatchLimit, type VenuesDto } from '@altynka/core';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { api, ApiError } from '../lib/api';
import { findVenue, venueRate, venuesPath } from '../lib/venues';
import { canManageEvent } from '../state/me';
import { EmptyState, ErrorNote, useReveal, useToast } from '../components/ui';
import { ScheduleFooterSkeleton, ScheduleSkeleton } from '../components/skeletons';
import { ActionSheet } from '../components/ActionSheet';
import { Icon } from '../components/Icon';
import { VenueMapLink, VenuePicker } from '../components/VenuePicker';
import { TemporalInput } from '../components/TemporalInput';
import { useResource } from '../hooks/useResource';
import { useMatchPhase } from '../hooks/useMatchPhase';

export function Schedule({ eventId, onClose }: { eventId?: string; onClose?: () => void }) {
  const params = useParams<{ id: string }>();
  const id = eventId ?? params.id;
  const [, navigate] = useLocation();
  const { data, error, reload } = useResource<EventDetailDto>(`/api/events/${id}`);
  const ev = useMatchPhase(data, reload);
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  // The venue lives here so its picker can sit beside the sheet, not inside it: React events from a
  // nested sheet would bubble into this one and Escape would close both.
  const [venue, setVenue] = useState<{ eventId: number; place: string } | null>(null);
  if (ev && venue?.eventId !== ev.id) setVenue({ eventId: ev.id, place: ev.place ?? '' });
  const pending = !ev && !error;
  const reveal = useReveal(pending);
  const close = onClose ?? (() => navigate(`/event/${id}`, { replace: true }));
  const title = ev?.status === 'scheduled' ? 'Изменить время и поле' : 'Назначить матч';
  if (ev && !canManageEvent(ev)) return <ActionSheet title="Назначить игру" onClose={close}><EmptyState title="Игру назначает организатор" text="Время и место появятся в карточке матча после назначения." /></ActionSheet>;
  const editable = !!ev && (ev.status === 'collecting' || ev.status === 'scheduled');
  // One sheet from skeleton to form: it slides in once and the fields fade in where their outlines stood.
  return <>
  <ActionSheet title={title} onClose={close} busy={busy} className={`schedule-sheet${picking ? ' sheet-covered' : ''}`}
    footer={editable ? <button type="submit" form={formId} className={`btn primary wide ${reveal}`} disabled={busy}>{busy ? 'Сохраняем…' : ev.status === 'scheduled' ? 'Сохранить изменения' : 'Назначить матч'}</button> : pending ? <ScheduleFooterSkeleton /> : undefined}>
    {!editable && error && <ErrorNote text="Не получилось загрузить сбор" retry={reload} />}
    {pending && <ScheduleSkeleton />}
    {editable && venue?.eventId === ev.id ? <ScheduleDraft key={ev.id} ev={ev} formId={formId} className={reveal} busy={busy} setBusy={setBusy} place={venue.place} picking={picking} setPicking={setPicking} onClose={close} />
      : ev && !editable && <EmptyState title="Изменить время уже нельзя" text="Для матча со счётом, завершённого или отменённого матча назначение недоступно." />}
  </ActionSheet>
  {picking && editable && venue && <VenuePicker communityId={ev.community.id} place={venue.place} onSelect={place => setVenue({ ...venue, place })} onClose={() => setPicking(false)} />}
  </>;
}

function ScheduleDraft({ ev, formId, className, busy, setBusy, place, picking, setPicking, onClose }: { ev: EventDetailDto; formId: string; className: string; busy: boolean; setBusy: (busy: boolean) => void; place: string; picking: boolean; setPicking: (picking: boolean) => void; onClose: () => void }) {
  const toast = useToast();
  const locked = useRef(false);
  const mounted = useRef(true);
  const [startTime, setStartTime] = useState(ev.startTime ?? '21:00');
  const [hours, setHours] = useState<1 | 2>(ev.durationHours ?? 1);
  // Формат задаёт размер основы. Пока организатор не выбрал его сам, длительность подсказывает
  // привычный вариант: час — две команды, два часа — три.
  const [limit, setLimit] = useState<MatchLimit>(matchFormat(ev.limit)?.limit ?? limitFor(ev.durationHours));
  const formatChosen = useRef(ev.status === 'scheduled');
  const pickHours = (h: 1 | 2) => {
    setHours(h);
    if (formatChosen.current) return;
    const size = matchFormat(limit)!.teamSize;
    setLimit(MATCH_FORMATS.find(f => f.teamSize === size && f.teamCount === (h === 2 ? 3 : 2))!.limit);
  };
  const [saveError, setSaveError] = useState<string | null>(null);
  const venue = findVenue(useResource<VenuesDto>(venuesPath(ev.community.id)).data?.venues, place);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current) return;
    locked.current = true; setSaveError(null); setBusy(true);
    try {
      await api.send('POST', `/api/events/${ev.id}/schedule`, { startTime, durationHours: hours, limit, place: place.trim() || undefined });
      if (!mounted.current) return;
      toast('Матч назначен, группа получила уведомление');
      onClose();
    } catch (err) {
      if (mounted.current) setSaveError(err instanceof ApiError && err.code === 'past_start' ? 'Выбери будущее время начала матча' : err instanceof ApiError && err.status === 409 ? 'Матч уже закрыт для изменений. Вернись к матчу, чтобы увидеть его состояние.' : 'Не получилось назначить матч. Данные сохранены — попробуй ещё раз.');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <form id={formId} className={`form ${className}`} onSubmit={submit}>
    <fieldset disabled={busy} className="form-fields">
      <label>Начало<TemporalInput type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} /></label>
      <fieldset className="form-fields"><legend className="schedule-field-label">Продолжительность</legend><div className="schedule-duration">
        {([1, 2] as const).map(h => <button type="button" key={h} className={`chip-btn${hours === h ? ' on' : ''}`} aria-pressed={hours === h} onClick={() => pickHours(h)}><b>{h === 1 ? '1 час' : '2 часа'}</b></button>)}
      </div></fieldset>
      <fieldset className="form-fields"><legend className="schedule-field-label">Формат</legend><div className="schedule-duration">
        {MATCH_FORMATS.map(f => <button type="button" key={f.limit} className={`chip-btn${limit === f.limit ? ' on' : ''}`} aria-pressed={limit === f.limit} aria-label={`${f.label}, ${f.limit} ${plural(f.limit, 'игрок', 'игрока', 'игроков')}`} onClick={() => { formatChosen.current = true; setLimit(f.limit); }}><b>{f.label}</b><small>{f.limit} {plural(f.limit, 'игрок', 'игрока', 'игроков')} в основе</small></button>)}
      </div></fieldset>
      <div><span id={`${formId}-venue-label`} className="schedule-field-label">Место проведения <span>· необязательно</span></span>
        <button type="button" className={`venue-trigger${place ? ' has-place' : ''}`} aria-haspopup="dialog" aria-expanded={picking} aria-labelledby={`${formId}-venue-label ${formId}-venue-value`} onClick={e => { e.currentTarget.focus(); setPicking(true); }}>
          <Icon name="pin" /><span id={`${formId}-venue-value`}>{place || 'Выбрать площадку'}{venue && <small>{venue.address ?? 'Адрес уточняется'}</small>}</span><Icon name="back" className="venue-chevron" />
        </button>
        {venue && <div className="venue-summary">{venue.mapUrl ? <VenueMapLink url={venue.mapUrl} /> : <span />}<span className="venue-rate">{venueRate(venue)}</span></div>}
      </div>
      <p className="muted">Участники получат время и место матча в уведомлении.</p>
    </fieldset>
    {saveError && <p className="field-error" role="alert">{saveError}</p>}
  </form>;
}
