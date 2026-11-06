import { useId, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { ActionSheet } from '../components/ActionSheet';
import { useToast } from '../components/ui';

/** Bottom sheet for bringing a friend to the match: one name field, the friend joins the queue like everyone else. */
export function AddGuestSheet({ eventId, onClose, onAdded }: { eventId: number; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const formId = useId();
  const locked = useRef(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const guest = name.trim();
    if (locked.current || !guest) return;
    locked.current = true; setBusy(true);
    try {
      const r = await api.send<{ kind: 'main' | 'reserve'; position: number }>('POST', `/api/events/${eventId}/guests`, { name: guest });
      toast(r.kind === 'main' ? `Друг в основе, №${r.position}` : `Мест нет, друг в резерве №${r.position}`);
      onAdded();
      locked.current = false; setBusy(false);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'guest_exists') toast(`${guest} уже в списке`);
      else toast(err instanceof ApiError && err.status === 409 ? 'Запись закрыта' : 'Не получилось добавить');
      locked.current = false; setBusy(false);
    }
  }
  return <ActionSheet title="Привести друга" onClose={onClose} busy={busy} footer={<button type="submit" form={formId} className="btn primary wide" disabled={busy || !name.trim()}>{busy ? 'Записываем…' : 'Записать'}</button>}>
    <form id={formId} className="form" onSubmit={submit}>
      <label>
        Имя друга
        <input required maxLength={24} enterKeyHint="done" autoComplete="off" value={name} onChange={e => setName(e.target.value)} disabled={busy} />
      </label>
      <p className="muted">Друг встанет в очередь как все. Его долю в счёте повесим на тебя.</p>
    </form>
  </ActionSheet>;
}
