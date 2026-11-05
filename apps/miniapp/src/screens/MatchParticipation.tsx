import type { EventDetailDto } from '@altynka/core';
import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { api, ApiError } from '../lib/api';
import { isOpen } from '../lib/labels';
import { haptic } from '../lib/tg';
import { canManage, useMe } from '../state/me';
import { Icon } from '../components/Icon';
import { ActionSheet } from '../components/ActionSheet';
import { MatchAction } from '../components/MatchAction';
import { useToast } from '../components/ui';

type JoinResult = { kind: 'main' | 'reserve' | 'already'; position: number };

export function MatchParticipation({ ev, reload }: { ev: EventDetailDto; reload: () => void }) {
  const me = useMe();
  const toast = useToast();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const schedule = canManage(me) && ev.status === 'collecting';
  const open = isOpen(ev.status);
  const reserveIndex = ev.reserve.findIndex(s => s.userId === me.userId);
  const status = ev.my === 'main' ? 'Ты в основе' : ev.my === 'reserve' ? `Ты в резерве${reserveIndex >= 0 ? ` · №${reserveIndex + 1}` : ''}` : 'Ты пока не записан';

  async function change(join: boolean) {
    if (locked.current || !open) return;
    locked.current = true; setBusy(true);
    try {
      const r = await api.send<JoinResult>('POST', `/api/events/${ev.id}/${join ? 'join' : 'leave'}`);
      haptic('success');
      toast(join ? r.kind === 'reserve' ? `Ты в резерве · №${r.position}` : r.kind === 'already' ? 'Ты уже записан' : 'Ты в основе' : 'Ты вышел из списка');
      setEditing(false);
    } catch (e) {
      haptic('error');
      toast(e instanceof ApiError && e.status === 409 ? 'Запись закрыта' : 'Не получилось, попробуй ещё раз');
    } finally { locked.current = false; setBusy(false); reload(); }
  }

  if (!open) return <div className="match-personal"><span className="match-personal-status"><Icon name={ev.status === 'cancelled' ? 'close' : 'check'} />{ev.status === 'cancelled' ? 'Игра отменена' : ev.my ? 'Ты играл' : 'Запись закрыта'}</span>{ev.my && ev.status !== 'cancelled' && <span className="match-personal-detail">Запись закрыта</span>}</div>;
  const joinLabel = busy ? 'Записываем…' : ev.mainCount >= ev.limit ? 'Встать в резерв' : 'Иду';
  return <>
    <div className="match-personal">
      <span className="match-personal-status">{ev.my && <Icon name={ev.my === 'main' ? 'check' : 'clock'} />}{status}</span>
      {ev.my ? <button className="btn-text" onClick={() => setEditing(true)} disabled={busy}>Изменить</button> : schedule ? <button className="btn-text" onClick={() => change(true)} disabled={busy}>{joinLabel}</button> : null}
    </div>
    {schedule ? <MatchAction><Link className="btn primary wide" href={`/event/${ev.id}/schedule`}>Назначить игру</Link></MatchAction> : !ev.my && <MatchAction><button className="btn primary wide" onClick={() => change(true)} disabled={busy}>{joinLabel}</button></MatchAction>}
    {editing && <ActionSheet title="Твоё участие" onClose={() => setEditing(false)} busy={busy}>
      <p className="muted">{status}</p>
      <button className="sheet-action danger-text" onClick={() => change(false)} disabled={busy}>{busy ? 'Сохраняем…' : 'Не иду'}</button>
    </ActionSheet>}
  </>;
}
