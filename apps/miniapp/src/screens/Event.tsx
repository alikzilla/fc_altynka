import { formatDateRu, type EventDetailDto } from '@altynka/core';
import { useEffect, type ReactNode } from 'react';
import { useLocation, useParams } from 'wouter';
import { useScreenSearch } from '../state/screenSearch';
import { STATUS_LABEL, timeRange } from '../lib/labels';
import { Icon } from '../components/Icon';
import { ErrorNote, Loading, Screen } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { EventList } from './EventList';
import { Teams } from './Teams';
import { Bill } from './Bill';

export type Tab = 'list' | 'teams' | 'bill';
const TABS: [Tab, string][] = [
  ['list', 'Список'],
  ['teams', 'Составы'],
  ['bill', 'Счёт'],
];

/** Вкладки составов и счёта подключаются сюда (Tasks 13–14). */
export const tabViews: Partial<Record<Tab, (p: { ev: EventDetailDto; reload: () => void }) => ReactNode>> = {
  list: p => <EventList {...p} />,
  teams: p => <Teams {...p} />,
  bill: p => <Bill {...p} />,
};

export function Event() {
  const { id } = useParams<{ id: string }>();
  const search = useScreenSearch();
  const [, navigate] = useLocation();
  const requestedTab = new URLSearchParams(search).get('tab');
  const tab: Tab = TABS.some(([key]) => key === requestedTab) ? requestedTab as Tab : 'list';
  const { data: ev, error, loading, reload } = useResource<EventDetailDto>(`/api/events/${id}`);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [reload]);
  const View = tabViews[tab];
  return (
    <Screen title={ev ? formatDateRu(ev.date) : 'Сбор'} back="/matches">
      {loading && !ev && <Loading variant="detail" />}
      {error && <ErrorNote text={error.status === 404 ? 'Сбор не найден' : 'Не получилось загрузить сбор'} retry={reload} />}
      {ev && (
        <>
          <div className="card material-plum event-summary">
            <div className="row between">
              <b>Игра · {ev.mainCount}/{ev.limit}</b>
              <span className={`chip status-${ev.status}`}>{STATUS_LABEL[ev.status]}</span>
            </div>
            <div className="event-meta"><Icon name="clock" /><span>{ev.startTime && ev.durationHours ? timeRange(ev.startTime, ev.durationHours) : 'Время уточняется'}</span></div>
            <div className="event-meta"><Icon name="pin" /><span>{ev.place || 'Поле уточняется'}</span></div>
            {ev.comment && <div className="muted">{ev.comment}</div>}
          </div>
          {ev.status !== 'cancelled' && <ol className="match-progress" aria-label="Этапы матча">{['Сбор', 'Игра назначена', 'Счёт', 'Завершён'].map((label, index) => {
            const current = ['collecting', 'scheduled', 'billing', 'closed'].indexOf(ev.status);
            return <li key={label} aria-current={index === current ? 'step' : undefined} className={index <= current ? 'done' : ''}><span aria-hidden="true">{index < current ? <Icon name="check" /> : index + 1}</span>{label}</li>;
          })}</ol>}
          <div className="tabs" role="tablist" aria-label="Детали сбора">
            {TABS.map(([k, label]) => (
              <button key={k} id={`tab-${k}`} role="tab" aria-controls={`panel-${k}`} tabIndex={tab === k ? 0 : -1} aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => navigate(`/event/${id}?tab=${k}`, { replace: true })} onKeyDown={e => {
                const index = TABS.findIndex(([key]) => key === k);
                const next = e.key === 'ArrowRight' ? (index + 1) % TABS.length : e.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
                if (next < 0) return;
                e.preventDefault();
                navigate(`/event/${id}?tab=${TABS[next][0]}`, { replace: true });
                document.getElementById(`tab-${TABS[next][0]}`)?.focus();
              }}>
                {label}
              </button>
            ))}
          </div>
          <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="tab-panel">{View && <View key={`${id}-${tab}`} ev={ev} reload={reload} />}</div>
        </>
      )}
    </Screen>
  );
}
