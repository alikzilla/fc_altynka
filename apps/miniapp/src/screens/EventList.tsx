import type { EventDetailDto, SignupDto } from '@altynka/core';
import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { Avatar, Icon } from '../components/Icon';
import { ActionSheet } from '../components/ActionSheet';
import { api } from '../lib/api';
import { isOpen } from '../lib/labels';
import { canManage, useMe } from '../state/me';
import { PlayerProfileSheet } from './PlayerProfile';
import { ConfirmButton, useToast } from '../components/ui';

export function EventList({ ev, reload }: { ev: EventDetailDto; reload: () => void }) {
  const me = useMe();
  const toast = useToast();
  const open = isOpen(ev.status);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [selected, setSelected] = useState<SignupDto | null>(null);
  const canRemove = (s: SignupDto) => open && (canManage(me) || s.userId === null && s.invitedByUserId === me.userId);
  async function remove(s: SignupDto) {
    if (locked.current || !canRemove(s)) return;
    locked.current = true; setBusy(true);
    try { await api.send('DELETE', `/api/signups/${s.id}`); toast(`${s.name} убран из списка`); setSelected(null); }
    catch { toast('Не получилось убрать игрока'); }
    finally { locked.current = false; setBusy(false); reload(); }
  }
  const row = (s: SignupDto, i: number) => <li key={s.id} className={`person ${s.userId === me.userId ? 'me' : ''}`}>
    <span className="num">{i + 1}</span><Avatar name={s.name} />
    <span className="name">{s.userId !== null ? <button className="btn-plain player-profile-link" onClick={() => setProfileId(s.userId)}>{s.name}</button> : s.name}{s.userId === me.userId && <span className="you">ты</span>}{s.guestOfName && <small className="match-guest muted">(друг: {s.guestOfName})</small>}</span>
    {canRemove(s) && <button className="player-menu-button" aria-label={`Действия: ${s.name}`} onClick={() => setSelected(s)} disabled={busy}><Icon name="more" /></button>}
  </li>;
  return <>
    <section>
      <div className="section-heading match-list-heading"><h2>Основа <span className="match-count">{ev.main.length}/{ev.limit}</span></h2>{open && <Link href={`/event/${ev.id}/guest`}><Icon name="plus" />Добавить друга</Link>}</div>
      {ev.comment && <p className="match-comment">{ev.comment}</p>}
      <ul className="card list material-graphite">{ev.main.length ? ev.main.map(row) : <li className="match-empty-row muted">Пока никого</li>}</ul>
    </section>
    {ev.reserve.length > 0 && <section><div className="section-heading"><h2>Резерв <span className="match-count">{ev.reserve.length}</span></h2></div><ul className="card list material-graphite">{ev.reserve.map(row)}</ul></section>}
    {profileId !== null && <PlayerProfileSheet userId={profileId} onClose={() => setProfileId(null)} />}
    {selected && canRemove(selected) && <ActionSheet title={selected.name} onClose={() => setSelected(null)} busy={busy}><ConfirmButton className="sheet-action danger-text" label="Убрать из списка" confirmLabel="Точно убрать?" disabled={busy} onConfirm={() => remove(selected)} /></ActionSheet>}
  </>;
}
