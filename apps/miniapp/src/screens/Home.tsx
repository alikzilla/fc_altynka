import { formatDateRu, type EventsListDto, type EventSummaryDto } from '@altynka/core';
import { Link, useLocation } from 'wouter';
import { STATUS_LABEL, whenLine } from '../labels';
import { canManage, useMe } from '../me';
import { ErrorNote, Loading, Screen } from '../ui';
import { useResource } from '../useResource';

function EventCard({ e }: { e: EventSummaryDto }) {
  return (
    <Link href={`/event/${e.id}`} className="card event-card">
      <div className="row between">
        <b className="date">{formatDateRu(e.date)}</b>
        <span className={`chip status-${e.status}`}>{STATUS_LABEL[e.status]}</span>
      </div>
      <div className="muted">{whenLine(e)}</div>
      <div className="row between">
        <span>
          Идут {e.mainCount}/{e.limit}
          {e.reserveCount ? ` · резерв ${e.reserveCount}` : ''}
        </span>
        {e.my && <span className={`chip ${e.my === 'main' ? 'ok' : 'warn'}`}>{e.my === 'main' ? 'Ты в основе' : 'Ты в резерве'}</span>}
      </div>
    </Link>
  );
}

export function Home() {
  const me = useMe();
  const [, navigate] = useLocation();
  const { data, error, loading } = useResource<EventsListDto>('/api/events');
  return (
    <Screen title="Сборы">
      {canManage(me) && (
        <button className="btn primary wide" onClick={() => navigate('/new')}>
          Новый сбор
        </button>
      )}
      {loading && !data && <Loading />}
      {error && <ErrorNote text="Не получилось загрузить сборы" />}
      {data && (
        <>
          {data.active.length ? data.active.map(e => <EventCard key={e.id} e={e} />) : <div className="card muted center">Ближайших сборов нет</div>}
          {data.past.length > 0 && (
            <>
              <h2 className="section">Прошедшие</h2>
              {data.past.map(e => (
                <EventCard key={e.id} e={e} />
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
