import type { EventDetailDto } from '@altynka/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useScreenSearch } from '../state/screenSearch';
import { canManageEvent } from '../state/me';
import { isOpen, timeRange } from '../lib/labels';
import { api } from '../lib/api';
import { Icon } from '../components/Icon';
import { GroupTag } from '../components/GroupTag';
import { ActionSheet } from '../components/ActionSheet';
import { ConfirmButton, ErrorNote, Loading, Screen, useToast } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { useMatchPhase } from '../hooks/useMatchPhase';
import { MatchParticipation } from './MatchParticipation';
import { EventList } from './EventList';
import { Teams } from './Teams';
import { Bill } from './Bill';
import { MatchRatings } from './MatchRatings';
import { MatchGames } from './MatchGames';

export type Tab = 'list' | 'teams' | 'games' | 'bill';
const BASE_TABS: [Tab, string][] = [['list', 'Участники'], ['teams', 'Составы'], ['bill', 'Оплата']];
export const tabViews: Partial<Record<Tab, (p: { ev: EventDetailDto; reload: () => void; actionBlocked?: boolean }) => ReactNode>> = {
  list: p => <EventList {...p} />, teams: p => <Teams {...p} />, games: p => <MatchGames {...p} />, bill: p => <Bill {...p} />,
};
const STATUS = { collecting: 'Набираем игроков', scheduled: 'Игра назначена', playing: 'Игра началась', billing: 'Собираем оплату', closed: 'Игра завершена', cancelled: 'Отменена' };

export function Event() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const search = useScreenSearch();
  const [, navigate] = useLocation();
  const requestedTab = new URLSearchParams(search).get('tab');
  const { data, error, loading, reload } = useResource<EventDetailDto>(`/api/events/${id}`);
  const ev = useMatchPhase(data, reload);
  const TABS: [Tab,string][] = ev?.protocolVersion===1 ? [['list','Участники'],['teams','Составы'],['games','Игра'],['bill','Оплата']] : BASE_TABS;
  const tab: Tab = TABS.some(([key]) => key === requestedTab) ? requestedTab as Tab : 'list';
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', visible); };
  }, [reload]);
  async function cancel() {
    if (!ev || !isOpen(ev.status) || locked.current) return;
    locked.current = true; setBusy(true);
    try { await api.send('POST', `/api/events/${ev.id}/cancel`); toast('Матч отменён'); setMenu(false); }
    catch { toast('Не получилось отменить матч'); }
    finally { locked.current = false; setBusy(false); reload(); }
  }
  const date = ev ? new Date(`${ev.date}T12:00:00Z`) : null;
  const title = date ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long', ...(date.getUTCFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }).format(date) : 'Матч';
  const weekday = date ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long' }).format(date) : undefined;
  const manage = ev && canManageEvent(ev) && isOpen(ev.status);
  const gamePrimary = !!ev && ev.protocolVersion===1 && canManageEvent(ev) && (tab==='teams' && !!ev.gameProtocol?.canStart || tab==='games' && !!ev.gameProtocol?.canRecord);
  const actionBlocked = !gamePrimary && !!ev && isOpen(ev.status) && (canManageEvent(ev) && ev.status === 'collecting' || !ev.my);
  const View = tabViews[tab];
  return <Screen title={title} subtitle={weekday} back="/matches" className="match-screen" action={manage && <button className="match-menu-button" aria-label="Действия матча" onClick={() => setMenu(true)}><Icon name="more" /></button>}>
    {loading && !ev && <Loading variant="detail" />}
    {error && <ErrorNote text={error.status === 404 ? 'Матч не найден' : 'Не получилось загрузить матч'} retry={reload} />}
    {ev && <>
      <section className={`card material-plum event-summary ${ev.status === 'cancelled' ? 'match-cancelled' : ''}`} aria-label="Игра и твоё участие">
        <GroupTag community={ev.community} always />
        <p className={`match-detail-time ${!ev.startTime ? 'unknown' : ''}`}>{ev.startTime && ev.durationHours ? timeRange(ev.startTime, ev.durationHours) : 'Время уточняется'}</p>
        <p className="match-detail-place"><Icon name="pin" /><span>{ev.place || 'Поле пока не выбрано'}</span></p>
        <p className="match-detail-meta"><span>{ev.mainCount} из {ev.limit} игроков</span><i aria-hidden="true" /><span>{STATUS[ev.status]}</span></p>
        <MatchParticipation key={ev.id} ev={ev} reload={reload} suppressAction={gamePrimary} />
      </section>
      <MatchRatings key={`ratings-${ev.id}`} ev={ev} reload={reload} />
      <div className="tabs" role="tablist" aria-label="Детали матча">{TABS.map(([k, label]) => <button key={k} id={`tab-${k}`} role="tab" aria-controls={`panel-${k}`} tabIndex={tab === k ? 0 : -1} aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => navigate(`/event/${id}?tab=${k}`, { replace: true })} onKeyDown={e => {
        const index = TABS.findIndex(([key]) => key === k);
        const next = e.key === 'ArrowRight' ? (index + 1) % TABS.length : e.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
        if (next < 0) return;
        e.preventDefault(); navigate(`/event/${id}?tab=${TABS[next][0]}`, { replace: true });
        document.getElementById(`tab-${TABS[next][0]}`)?.focus();
      }}>{label}</button>)}</div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="tab-panel">{View && <View key={`${id}-${tab}`} ev={ev} reload={reload} actionBlocked={actionBlocked} />}</div>
      {menu && manage && <ActionSheet title="Действия матча" onClose={() => setMenu(false)} busy={busy}>
        <Link className="sheet-action" href={`/event/${ev.id}/schedule`} aria-disabled={busy} tabIndex={busy ? -1 : 0} onClick={e => { if (busy) e.preventDefault(); else setMenu(false); }}>{ev.status === 'scheduled' ? 'Изменить время и поле' : 'Назначить игру'}<Icon name="arrow" /></Link>
        <ConfirmButton className="sheet-action danger-text" label="Отменить матч" confirmLabel="Точно отменить матч?" disabled={busy} onConfirm={cancel} />
      </ActionSheet>}
    </>}
  </Screen>;
}
