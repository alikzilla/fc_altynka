import { todayAlmaty } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { api, ApiError } from '../lib/api';
import { creatableCommunities, useMe } from '../state/me';
import { ConnectGroupButton, CONNECT_BOT_TEXT } from '../components/ConnectGroup';
import { useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { TemporalInput } from '../components/TemporalInput';
import { ActionSheet } from '../components/ActionSheet';

export function NewEvent({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const [, navigate] = useLocation();
  const toast = useToast();
  const locked = useRef(false);
  const live = useRef(true);
  const [date, setDate] = useState(() => todayAlmaty(new Date(Date.now() + 86_400_000)));
  const [comment, setComment] = useState('');
  const groups = creatableCommunities(me);
  const [picked, setPicked] = useState<number | null>(null);
  const communityId = groups.length === 1 ? groups[0].id : picked;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current || communityId === null) return;
    setError(null);
    if (!date || date < todayAlmaty(new Date())) { setError('Выбери сегодняшнюю или будущую дату'); return; }
    locked.current = true;
    setBusy(true);
    try {
      await api.send('POST', '/api/events', { date, communityId, comment: comment.trim() || undefined });
      if (!live.current) return;
      navigate('/matches', { replace: true });
      toast('Матч создан. Теперь можно собирать участников');
      requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());
    } catch (err) {
      if (!live.current) return;
      setError(err instanceof ApiError && err.code === 'past_date' ? 'Выбери сегодняшнюю или будущую дату' : err instanceof ApiError && err.status === 403 ? 'Нет доступа к созданию матча в этой группе' : 'Не получилось создать матч. Проверь соединение и попробуй ещё раз.');
      locked.current = false;
      setBusy(false);
    }
  }
  return <ActionSheet title="Новый матч" description="Дата и группа для сбора" closeLabel="Закрыть создание матча" onClose={onClose} busy={busy}>
    {groups.length ? (
    <form className="form new-event-form" onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy} className="form-fields">
        <label>Дата<TemporalInput type="date" required min={todayAlmaty(new Date())} value={date} onChange={e => setDate(e.target.value)} /></label>
        {groups.length > 1 && <label>Группа
          <select required aria-describedby="group-hint" value={picked ?? ''} onChange={e => setPicked(e.target.value ? Number(e.target.value) : null)}>
            <option value="" disabled>Выбери группу</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>}
        {groups.length > 1 && <p id="group-hint" className="muted">Сообщение о сборе появится в выбранной группе.</p>}
        <label>Комментарий · необязательно<textarea maxLength={200} rows={3} placeholder="Например, берём светлые и тёмные футболки" value={comment} onChange={e => setComment(e.target.value)} /></label>
      </fieldset>
      <p className="muted">Игроки могут записываться сразу. Назначь время и длительность матча. Счёт станет доступен после его начала.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn primary wide" disabled={busy || communityId === null}>{busy ? 'Создаём матч…' : groups.length > 1 ? 'Открыть запись' : 'Создать матч'}<Icon name="plus" /></button>
    </form>
    ) : (
    <div className="empty-sheet">
      <p>{groups.length || me.communities.length ? 'Создавать матчи может организатор группы. Попроси администратора группы назначить тебя организатором.' : CONNECT_BOT_TEXT}</p>
      {me.communities.length > 0 && <p className="muted">Или подключи свою группу: добавь в неё бота администратором.</p>}
      <ConnectGroupButton />
    </div>
    )}
  </ActionSheet>;
}
