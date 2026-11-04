import type { EventDetailDto } from '@altynka/core';
import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { api, ApiError } from '../lib/api';
import { canManage, useMe } from '../state/me';
import { EmptyState, ErrorNote, Loading, Screen, useToast } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { TemporalInput } from '../components/TemporalInput';

export function Schedule() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const toast = useToast();
  const me = useMe();
  const { data: ev, error, reload } = useResource<EventDetailDto>(`/api/events/${id}`);
  const [busy, setBusy] = useState(false);
  const [startTime, setStartTime] = useState('21:00');
  const [hours, setHours] = useState<1 | 2>(1);
  const [place, setPlace] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const open = ev?.status === 'collecting' || ev?.status === 'scheduled';
  useEffect(() => {
    if (!ev) return;
    if (ev.startTime) setStartTime(ev.startTime);
    if (ev.durationHours) setHours(ev.durationHours);
    if (ev.place) setPlace(ev.place);
  }, [ev]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ev || !open || !canManage(me)) return;
    setSaveError(null);
    setBusy(true);
    try {
      await api.send('POST', `/api/events/${id}/schedule`, { startTime, durationHours: hours, place: place.trim() || undefined });
      toast('Игра назначена, группа получила уведомление');
      navigate(`/event/${id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof ApiError && err.status === 409 ? 'Матч уже закрыт для изменений. Вернись к матчу, чтобы увидеть его состояние.' : 'Не получилось назначить игру. Данные сохранены — попробуй ещё раз.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title={ev?.status === 'scheduled' ? 'Изменить время и поле' : 'Назначить игру'} back={`/event/${id}`} subtitle="Участники получат уведомление в группе">
      {error && <ErrorNote text="Не получилось загрузить сбор" retry={reload} />}
      {!canManage(me) ? <EmptyState title="Игру назначает организатор" text="Время и место появятся в карточке матча после назначения." /> : !ev ? !error && <Loading variant="form" /> : !open ? <EmptyState title="Изменить время уже нельзя" text="Для матча со счётом, завершённого или отменённого матча назначение недоступно." /> : <form className="card form" onSubmit={submit}>
        <fieldset disabled={busy} className="form-fields">
        <label>
          Начало
          <TemporalInput type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} />
        </label>
        <div className="chips">
          {([1, 2] as const).map(h => (
            <button type="button" key={h} className={`chip-btn ${hours === h ? 'on' : ''}`} aria-pressed={hours === h} onClick={() => setHours(h)}>
              {h === 1 ? '1 час · 10 человек' : '2 часа · 15 человек'}
            </button>
          ))}
        </div>
        <label>
          Поле · необязательно
          <input maxLength={80} placeholder="Где играем" value={place} onChange={e => setPlace(e.target.value)} />
        </label>
        <p className="muted">1 час — до 10 игроков в основе, 2 часа — до 15. Остальные остаются в резерве по порядку записи.</p>
        </fieldset>
        {saveError && <p className="field-error" role="alert">{saveError}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? 'Сохраняем…' : ev.status === 'scheduled' ? 'Сохранить изменения' : 'Назначить игру'}</button>
      </form>}
    </Screen>
  );
}
