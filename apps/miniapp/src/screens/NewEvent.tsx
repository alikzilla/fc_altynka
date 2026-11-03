import { todayAlmaty } from '@altynka/core';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { api } from '../api';
import { Screen, useToast } from '../ui';

export function NewEvent() {
  const [, navigate] = useLocation();
  const toast = useToast();
  const [date, setDate] = useState(() => todayAlmaty(new Date(Date.now() + 86_400_000)));
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await api.send<{ id: number }>('POST', '/api/events', { date, comment: comment.trim() || undefined });
      toast('Сбор создан, сообщение уже в группе');
      navigate(`/event/${id}`, { replace: true });
    } catch {
      toast('Не получилось создать сбор');
      setBusy(false);
    }
  }
  return (
    <Screen title="Новый сбор" back="/">
      <form className="card form" onSubmit={submit}>
        <label>
          Дата
          <input type="date" required value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label>
          Комментарий
          <input maxLength={200} placeholder="Например: берём светлые футболки" value={comment} onChange={e => setComment(e.target.value)} />
        </label>
        <p className="muted">Время и длительность впишешь, когда забронируешь поле.</p>
        <button className="btn primary wide" disabled={busy}>
          Создать и отправить в группу
        </button>
      </form>
    </Screen>
  );
}
