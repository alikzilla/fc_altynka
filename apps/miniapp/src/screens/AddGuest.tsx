import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { api, ApiError } from '../api';
import { Screen, useToast } from '../ui';

export function AddGuest() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.send<{ kind: 'main' | 'reserve'; position: number }>('POST', `/api/events/${id}/guests`, { name: name.trim() });
      toast(r.kind === 'main' ? `Друг в основе, №${r.position}` : `Мест нет, друг в резерве №${r.position}`);
      navigate(`/event/${id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'guest_exists') toast(`${name.trim()} уже в списке`);
      else toast(err instanceof ApiError && err.status === 409 ? 'Запись закрыта' : 'Не получилось добавить');
      setBusy(false);
    }
  }
  return (
    <Screen title="Привести друга" back={`/event/${id}`}>
      <form className="card form" onSubmit={submit}>
        <label>
          Имя друга
          <input required autoFocus maxLength={24} value={name} onChange={e => setName(e.target.value)} />
        </label>
        <p className="muted">Друг встанет в очередь как все. Его долю в счёте повесим на тебя.</p>
        <button className="btn primary wide" disabled={busy || !name.trim()}>
          Записать
        </button>
      </form>
    </Screen>
  );
}
