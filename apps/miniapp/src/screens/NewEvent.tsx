import { todayAlmaty } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { api, ApiError } from '../lib/api';
import { useMe } from '../state/me';
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
    if (locked.current || closing) return;
    setError(null);
    if (!date || date < todayAlmaty(new Date())) { setError('Выбери сегодняшнюю или будущую дату'); return; }
    locked.current = true;
    setBusy(true);
    try {
      await api.send('POST', '/api/events', { date, communityId: me.community?.id, comment: comment.trim() || undefined });
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
    <form className="form new-event-form" onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy || closing} className="form-fields">
        <label>Дата<TemporalInput type="date" required min={todayAlmaty(new Date())} value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Группа<select value={String(me.community?.id ?? '')} aria-describedby="group-hint" onChange={() => {}}><option value={String(me.community?.id ?? '')}>{me.community?.title ?? 'Группа Telegram'}</option></select></label>
        <p id="group-hint" className="muted">Сообщение о сборе появится в этой группе.</p>
        <label>Комментарий · необязательно<textarea maxLength={200} rows={3} placeholder="Например, берём светлые и тёмные футболки" value={comment} onChange={e => setComment(e.target.value)} /></label>
      </fieldset>
      <p className="muted">После сбора участников назначь время и длительность игры. Затем можно будет выставить счёт.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn primary wide" disabled={busy || closing}>{busy ? 'Создаём матч…' : 'Создать матч'}<Icon name="plus" /></button>
    </form>
    </div>
  </dialog>;
}
