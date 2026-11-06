import { todayAlmaty } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { api, ApiError } from '../lib/api';
import { creatableCommunities, useMe } from '../state/me';
import { ConnectGroupButton, CONNECT_BOT_TEXT } from '../components/ConnectGroup';
import { useBackButton } from '../lib/tg';
import { useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { useBottomSheet } from '../hooks/useBottomSheet';
import { TemporalInput } from '../components/TemporalInput';
import { EdgeBackGesture } from '../components/EdgeBackGesture';

export function NewEvent({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const [, navigate] = useLocation();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const live = useRef(true);
  const backdropStart = useRef(false);
  const [date, setDate] = useState(() => todayAlmaty(new Date(Date.now() + 86_400_000)));
  const [comment, setComment] = useState('');
  const groups = creatableCommunities(me);
  const [picked, setPicked] = useState<number | null>(null);
  const communityId = groups.length === 1 ? groups[0].id : picked;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { dismiss: close, closing } = useBottomSheet(dialog, onClose, locked);
  useBackButton(close);
  useEffect(() => {
    live.current = true;
    const node = dialog.current!;
    const focus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    node.showModal();
    node.querySelector<HTMLElement>('h2')?.focus();
    document.body.style.overflow = 'hidden';
    return () => { live.current = false; node.close(); document.body.style.overflow = overflow; focus?.focus(); };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current || closing || communityId === null) return;
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
  return <dialog ref={dialog} className="create-sheet" aria-labelledby="create-title" aria-describedby="create-description" aria-modal="true" onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => {
    if (e.key !== 'Tab') return;
    const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) { e.preventDefault(); e.currentTarget.querySelector<HTMLElement>('h2')?.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement?.id === 'create-title')) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }} onPointerDown={e => {
    const box = e.currentTarget.getBoundingClientRect();
    backdropStart.current = e.target === e.currentTarget && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom);
  }} onClick={e => {
    if (e.target !== e.currentTarget || !backdropStart.current) return;
    backdropStart.current = false;
    const box = e.currentTarget.getBoundingClientRect();
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) close();
  }}>
    <EdgeBackGesture onBack={close} disabled={busy || closing} />
    <div className="sheet-drag-area" aria-hidden="true"><span /></div>
    <header className="sheet-heading"><div><h2 id="create-title" tabIndex={-1}>Новый матч</h2><p className="muted" id="create-description">Дата и группа для сбора</p></div><button className="sheet-close" type="button" aria-label="Закрыть создание матча" onClick={close} disabled={busy || closing}><Icon name="close" /></button></header>
    <div className="sheet-content">
    {groups.length ? (
    <form className="form new-event-form" onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy || closing} className="form-fields">
        <label>Дата<TemporalInput type="date" required min={todayAlmaty(new Date())} value={date} onChange={e => setDate(e.target.value)} /></label>
        {groups.length > 1 && <>
          <div className="group-picker" role="radiogroup" aria-labelledby="group-label" aria-describedby="group-hint">
            <span id="group-label" className="group-picker-label">Группа</span>
            {groups.map(g => <label key={g.id} className={`group-row ${picked === g.id ? 'on' : ''}`}>
              <input type="radio" name="group" value={g.id} checked={picked === g.id} onChange={() => setPicked(g.id)} />
              <span className="group-dot" aria-hidden="true" /><span className="group-name">{g.title}</span>
            </label>)}
          </div>
          <p id="group-hint" className="muted">Сообщение о сборе появится в выбранной группе.</p>
        </>}
        <label>Комментарий · необязательно<textarea maxLength={200} rows={3} placeholder="Например, берём светлые и тёмные футболки" value={comment} onChange={e => setComment(e.target.value)} /></label>
      </fieldset>
      <p className="muted">Игроки могут записываться сразу. Назначь время и длительность игры. Счёт станет доступен после её начала.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn primary wide" disabled={busy || closing || communityId === null}>{busy ? 'Создаём матч…' : groups.length > 1 ? 'Открыть запись' : 'Создать матч'}<Icon name="plus" /></button>
    </form>
    ) : (
    <div className="empty-sheet">
      <p>{groups.length || me.communities.length ? 'Создавать матчи может организатор группы. Попроси администратора группы назначить тебя организатором.' : CONNECT_BOT_TEXT}</p>
      {me.communities.length > 0 && <p className="muted">Или подключи свою группу: добавь в неё бота администратором.</p>}
      <ConnectGroupButton />
    </div>
    )}
    </div>
  </dialog>;
}
