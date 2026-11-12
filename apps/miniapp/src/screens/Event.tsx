import type { EventDetailDto } from '@altynka/core';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useScreenSearch } from '../state/screenSearch';
import { canManageEvent } from '../state/me';
import { isOpen, timeRange } from '../lib/labels';
import { api } from '../lib/api';
import { matchLink } from '../lib/bot';
import { haptic, shareLink } from '../lib/tg';
import { matchOrigin } from '../lib/navHistory';
import { Icon } from '../components/Icon';
import { GroupTag } from '../components/GroupTag';
import { ActionSheet } from '../components/ActionSheet';
import { ConfirmButton, ErrorNote, Screen, Sk, useReveal, useToast } from '../components/ui';
import { EventSkeleton, EventTabSkeleton } from '../components/skeletons';
import { useResource } from '../hooks/useResource';
import { useMatchPhase } from '../hooks/useMatchPhase';
import { MatchParticipation } from './MatchParticipation';
import { EventList } from './EventList';
import { MatchRatings } from './MatchRatings';

const Teams = lazy(() => import('./Teams').then(m => ({ default: m.Teams })));
const Bill = lazy(() => import('./Bill').then(m => ({ default: m.Bill })));
const MatchGames = lazy(() => import('./MatchGames').then(m => ({ default: m.MatchGames })));

export type Tab = 'list' | 'teams' | 'games' | 'bill';
const BASE_TABS: [Tab, string][] = [['list', 'Участники'], ['teams', 'Составы'], ['bill', 'Оплата']];
export const tabViews: Partial<Record<Tab, (p: { ev: EventDetailDto; reload: () => void; actionBlocked?: boolean }) => ReactNode>> = {
  list: p => <EventList {...p} />, teams: p => <Teams {...p} />, games: p => <MatchGames {...p} />, bill: p => <Bill {...p} />,
};

export function Event() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const search = useScreenSearch();
  const [, navigate] = useLocation();
  const requestedTab = new URLSearchParams(search).get('tab');
  const { data, error, loading, reload } = useResource<EventDetailDto>(`/api/events/${id}`);
  const ev = useMatchPhase(data, reload);
  const pending = loading && !ev;
  const reveal = useReveal(pending);
  const TABS: [Tab,string][] = ev?.protocolVersion===1 ? [['list','Участники'],['teams','Составы'],['games','Игры'],['bill','Оплата']] : BASE_TABS;
  // Without an explicit tab the page opens where the match is now: the protocol while playing, payment while billing.
  const phaseTab: Tab = !ev ? 'list' : ev.status === 'billing' ? 'bill' : ev.protocolVersion === 1 && (ev.status === 'playing' || ev.status === 'closed') && ev.startedAt != null ? 'games' : 'list';
  const tab: Tab = TABS.some(([key]) => key === requestedTab) ? requestedTab as Tab : phaseTab;
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
    catch { toast('Не получилось отменить матч. Попробуй ещё раз.', { tone: 'error' }); }
    finally { locked.current = false; setBusy(false); reload(); }
  }
  const date = ev ? new Date(`${ev.date}T12:00:00Z`) : null;
  const title = date ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long', ...(date.getUTCFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }).format(date) : 'Матч';
  const weekday = date ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long' }).format(date) : undefined;
  const manage = ev && canManageEvent(ev) && isOpen(ev.status);
  function invite() {
    if (!ev) return;
    const when = [title, weekday, ev.startTime && ev.durationHours ? timeRange(ev.startTime, ev.durationHours) : null, ev.place].filter(Boolean).join(' · ');
    const roster = ev.mainCount < ev.limit ? `Записано ${ev.mainCount} из ${ev.limit}, есть места.` : 'Основа заполнена, можно встать в резерв.';
    haptic('light');
    shareLink(matchLink(ev.id), `Матч ${when}\n${roster}`);
  }
  const gamePrimary = !!ev && ev.protocolVersion===1 && canManageEvent(ev) && (tab==='teams' && !!ev.gameProtocol?.canStart || tab==='games' && !!ev.gameProtocol?.canRecord);
  const actionBlocked = !gamePrimary && !!ev && isOpen(ev.status) && (canManageEvent(ev) && ev.status === 'collecting' || !ev.my);
  const View = tabViews[tab];
  return <Screen title={title} subtitle={weekday ?? (pending ? <Sk w="5.5em" /> : undefined)} back={matchOrigin()} className="match-screen" action={ev && isOpen(ev.status) && <div className="match-heading-actions">
    <button className="match-menu-button" aria-label="Позвать в матч" onClick={invite}><Icon name="share" /></button>
    {manage && <button className="match-menu-button" aria-label="Действия матча" onClick={() => setMenu(true)}><Icon name="more" /></button>}
  </div>}>
    {pending && <EventSkeleton />}
    {error && <ErrorNote text={error.status === 404 ? 'Матч не найден' : 'Не получилось загрузить матч'} retry={reload} />}
    {ev && <>
      <section className={`card material-plum event-summary ${reveal} ${ev.status === 'cancelled' ? 'match-cancelled' : ''}`} aria-label="Матч и твоё участие">
        <div className="match-summary-top"><GroupTag community={ev.community} always /><p className={`match-detail-time ${!ev.startTime ? 'unknown' : ''}`}>{ev.startTime && ev.durationHours ? timeRange(ev.startTime, ev.durationHours) : 'Время уточняется'}</p></div>
        <p className="match-detail-place"><Icon name="pin" /><span>{ev.place || 'Поле пока не выбрано'}</span></p>
        <MatchParticipation key={ev.id} ev={ev} reload={reload} suppressAction={gamePrimary} />
      </section>
      <MatchRatings key={`ratings-${ev.id}`} ev={ev} reload={reload} />
      <div className={`tabs ${reveal}`} role="tablist" aria-label="Детали матча">{TABS.map(([k, label]) => <button key={k} id={`tab-${k}`} role="tab" aria-controls={tab === k ? `panel-${k}` : undefined} tabIndex={tab === k ? 0 : -1} aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => navigate(`/event/${id}?tab=${k}`, { replace: true })} onKeyDown={e => {
        const index = TABS.findIndex(([key]) => key === k);
        const next = e.key === 'ArrowRight' ? (index + 1) % TABS.length : e.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
        if (next < 0) return;
        e.preventDefault(); navigate(`/event/${id}?tab=${TABS[next][0]}`, { replace: true });
        document.getElementById(`tab-${TABS[next][0]}`)?.focus();
      }}>{label}</button>)}</div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className={`tab-panel ${reveal}`}><Suspense fallback={<EventTabSkeleton tab={tab} />}>{View && <View key={`${id}-${tab}`} ev={ev} reload={reload} actionBlocked={actionBlocked} />}</Suspense></div>
      {menu && manage && <ActionSheet title="Действия матча" onClose={() => setMenu(false)} busy={busy}>
        <Link className="sheet-action" href={`/event/${ev.id}/schedule`} aria-disabled={busy} tabIndex={busy ? -1 : 0} onClick={e => { if (busy) e.preventDefault(); else setMenu(false); }}>{ev.status === 'scheduled' ? 'Изменить время и поле' : 'Назначить матч'}<Icon name="arrow" /></Link>
        <ConfirmButton className="sheet-action danger-text" label="Отменить матч" confirmLabel="Точно отменить матч?" disabled={busy} onConfirm={cancel} />
      </ActionSheet>}
    </>}
  </Screen>;
}
