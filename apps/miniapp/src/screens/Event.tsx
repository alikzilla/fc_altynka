import { formatDateRu, type EventDetailDto } from '@altynka/core';
import type { ReactNode } from 'react';
import { useLocation, useParams, useSearch } from 'wouter';
import { STATUS_LABEL, whenLine } from '../labels';
import { ErrorNote, Loading, Screen } from '../ui';
import { useResource } from '../useResource';
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
  const search = useSearch();
  const [, navigate] = useLocation();
  const tab = (new URLSearchParams(search).get('tab') as Tab) || 'list';
  const { data: ev, error, loading, reload } = useResource<EventDetailDto>(`/api/events/${id}`);
  const View = tabViews[tab];
  return (
    <Screen title={ev ? formatDateRu(ev.date) : 'Сбор'} back="/">
      {loading && !ev && <Loading />}
      {error && <ErrorNote text={error.status === 404 ? 'Сбор не найден' : 'Не получилось загрузить сбор'} />}
      {ev && (
        <>
          <div className="card">
            <div className="row between">
              <b>{whenLine(ev)}</b>
              <span className={`chip status-${ev.status}`}>{STATUS_LABEL[ev.status]}</span>
            </div>
            {ev.comment && <div className="muted">{ev.comment}</div>}
          </div>
          <div className="tabs" role="tablist">
            {TABS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => navigate(`/event/${id}?tab=${k}`, { replace: true })}>
                {label}
              </button>
            ))}
          </div>
          {View ? View({ ev, reload }) : <div className="card muted center">Скоро</div>}
        </>
      )}
    </Screen>
  );
}
