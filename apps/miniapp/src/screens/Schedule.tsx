import type { EventDetailDto } from '@sbor/core';
import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { api } from '../api';
import { Screen, useToast } from '../ui';
import { useResource } from '../useResource';

export function Schedule() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const toast = useToast();
  const { data: ev } = useResource<EventDetailDto>(`/api/events/${id}`);
  const [startTime, setStartTime] = useState('21:00');
  const [hours, setHours] = useState<1 | 2>(1);
  const [place, setPlace] = useState('');
  useEffect(() => {
    if (!ev) return;
    if (ev.startTime) setStartTime(ev.startTime);
    if (ev.durationHours) setHours(ev.durationHours);
    if (ev.place) setPlace(ev.place);
  }, [ev]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.send('POST', `/api/events/${id}/schedule`, { startTime, durationHours: hours, place: place.trim() || undefined });
      toast('Игра назначена, группа получила уведомление');
      navigate(`/event/${id}`, { replace: true });
    } catch {
      toast('Не получилось сохранить');
    }
  }
  return (
    <Screen title="Назначить игру" back={`/event/${id}`}>
      <form className="card form" onSubmit={submit}>
        <label>
          Начало
          <input type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} />
        </label>
        <div className="chips">
          {([1, 2] as const).map(h => (
            <button type="button" key={h} className={`chip-btn ${hours === h ? 'on' : ''}`} aria-pressed={hours === h} onClick={() => setHours(h)}>
              {h === 1 ? '1 час · 10 человек' : '2 часа · 15 человек'}
            </button>
          ))}
        </div>
        <label>
          Поле
          <input maxLength={80} placeholder="Где играем" value={place} onChange={e => setPlace(e.target.value)} />
        </label>
        <button className="btn primary wide">Сохранить</button>
      </form>
    </Screen>
  );
}
