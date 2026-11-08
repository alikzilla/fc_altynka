import type { EventDetailDto } from '@altynka/core';
import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { api, ApiError } from '../lib/api';
import { isOpen } from '../lib/labels';
import { haptic } from '../lib/tg';
import { canManageEvent, useMe } from '../state/me';
import { Icon } from '../components/Icon';
import { ActionSheet } from '../components/ActionSheet';
import { MatchAction } from '../components/MatchAction';
import { useToast } from '../components/ui';
import { noteJoinedMatch } from '../components/SkillsPrompt';

type JoinResult = { kind: 'main' | 'reserve' | 'already'; position: number };

export function MatchParticipation({ ev, reload, suppressAction = false }: { ev: EventDetailDto; reload: () => void; suppressAction?: boolean }) {
  const me = useMe();
  const toast = useToast();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [failure, setFailure] = useState<{ join: boolean; text: string } | null>(null);
  const schedule = canManageEvent(ev) && ev.status === 'collecting';
  const open = isOpen(ev.status);
  const reserveIndex = ev.reserve.findIndex(s => s.userId === me.userId);
  // Who takes the freed spot: the first person waiting in reserve.
  const successor = ev.my === 'main' ? ev.reserve[0]?.name ?? null : null;
  const leaveNote = ev.my === 'main'
    ? successor ? `Твоё место в основе перейдёт к ${successor}. Если передумаешь, запишешься заново — в конец резерва.` : 'Место в основе освободится. Вернуться можно, пока запись открыта и есть места.'
    : `Ты потеряешь место №${reserveIndex + 1} в резерве. Если передумаешь, встанешь в конец очереди.`;
  const status = ev.my === 'main' ? 'Ты в основе' : ev.my === 'reserve' ? `Ты в резерве${reserveIndex >= 0 ? ` · №${reserveIndex + 1}` : ''}` : 'Ты пока не записан';

  async function change(join: boolean) {
    if (locked.current || !open) return;
    locked.current = true; setBusy(true); setFailure(null);
    try {
      const r = await api.send<JoinResult>('POST', `/api/events/${ev.id}/${join ? 'join' : 'leave'}`);
      haptic('success');
      if (join && r.kind !== 'already') noteJoinedMatch();
      toast(join ? r.kind === 'reserve' ? `Ты в резерве · №${r.position}` : r.kind === 'already' ? 'Ты уже записан' : 'Ты в основе' : successor ? `Ты вышел из списка. Место перешло к ${successor}` : 'Ты вышел из списка');
      setEditing(false);
    } catch (e) {
      haptic('error');
      setFailure({ join, text: e instanceof ApiError && e.status === 409 ? 'Запись уже закрыта. Обнови страницу матча.' : join ? 'Не получилось записаться. Проверь интернет и попробуй ещё раз.' : 'Не получилось выйти из списка. Проверь интернет и попробуй ещё раз.' });
    } finally { locked.current = false; setBusy(false); reload(); }
  }

  if (!open) return <div className="match-personal"><span className="match-personal-status"><Icon name={ev.status === 'cancelled' ? 'close' : 'check'} />{ev.status === 'cancelled' ? 'Матч отменён' : ev.my ? 'Ты играл' : 'Запись закрыта'}</span>{ev.my && ev.status !== 'cancelled' && <span className="match-personal-detail">Запись закрыта</span>}</div>;
  const joinLabel = busy ? 'Записываем…' : ev.mainCount >= ev.limit ? 'Встать в резерв' : 'Иду';
  return <>
    <div className="match-personal">
      <span className="match-personal-status">{ev.my && <Icon name={ev.my === 'main' ? 'check' : 'clock'} />}{status}</span>
      {ev.my ? <button className="btn-text" onClick={() => setEditing(true)} disabled={busy}>Изменить</button> : schedule || suppressAction ? <button className="btn-text" onClick={() => change(true)} disabled={busy}>{joinLabel}</button> : null}
    </div>
    {failure && !editing && <p className="field-error inline-failure" role="alert">{failure.text} <button className="btn-text" onClick={() => change(failure.join)} disabled={busy}>Повторить</button></p>}
    {schedule ? <MatchAction><Link className="btn primary wide" href={`/event/${ev.id}/schedule`}>Назначить матч</Link></MatchAction> : !ev.my && !suppressAction && <MatchAction><button className="btn primary wide" onClick={() => change(true)} disabled={busy}>{joinLabel}</button></MatchAction>}
    {editing && <ActionSheet title="Твоё участие" onClose={() => setEditing(false)} busy={busy}>
      <p className="muted">{status}</p>
      <p className="sheet-note">{leaveNote}</p>
      {failure && !failure.join && <p className="field-error" role="alert">{failure.text}</p>}
      <button className="sheet-action danger-text" onClick={() => change(false)} disabled={busy}>{busy ? 'Выходим…' : 'Не иду, выйти из списка'}</button>
      <button className="sheet-action" onClick={() => setEditing(false)} disabled={busy}>Остаюсь</button>
    </ActionSheet>}
  </>;
}
