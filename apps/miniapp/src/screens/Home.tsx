import type { EventsListDto } from '@altynka/core';
import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { Icon } from '../components/Icon';
import { MatchCard, MatchRow } from '../components/MatchCard';
import { canManage, useMe } from '../state/me';
import { useNotifications } from '../state/notifications';
import { TaskCard } from '../components/TaskCard';
import { Screen, EmptyState, ErrorNote, Loading } from '../components/ui';
import { useResource } from '../hooks/useResource';

export function Home() {
  const me = useMe();
  const { data, error, loading, reload } = useResource<EventsListDto>('/api/events');
  const notifications = useNotifications();
  const carousel = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const upcoming = data?.active.filter(e => e.status === 'collecting' || e.status === 'scheduled' || e.status === 'playing').sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id) ?? [];
  const tasks = notifications.data?.tasks ?? [];
  const latest = data ? [...data.active.filter(e => e.status === 'billing'), ...data.past].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 1) : [];
  function go(direction: number) {
    const next = Math.max(0, Math.min(upcoming.length - 1, index + direction));
    const node = carousel.current?.children[next] as HTMLElement | undefined;
    if (node) carousel.current?.scrollTo({ left: node.offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  return <Screen title="Ближайший матч">
    {loading && !data && <Loading variant="home" />}
    {error && <ErrorNote text="Не получилось загрузить сборы" retry={reload} />}
    {data && (upcoming.length ? <>
      <div className={`match-carousel ${upcoming.length === 1 ? 'single' : ''}`} role="region" aria-label="Ближайшие матчи" ref={carousel} onScroll={e => {
        const el = e.currentTarget;
        const first = el.children[0] as HTMLElement;
        if (first) setIndex(Math.min(upcoming.length - 1, Math.round(el.scrollLeft / (first.offsetWidth + 12))));
      }}>{upcoming.map((event, i) => <MatchCard key={event.id} event={event} index={i} />)}</div>
      {upcoming.length > 1 && <div className="carousel-controls"><button className="carousel-arrow" onClick={() => go(-1)} disabled={index === 0} aria-label="Предыдущий матч"><Icon name="back" /></button><span aria-live="polite">{index + 1} из {upcoming.length}</span><button className="carousel-arrow" onClick={() => go(1)} disabled={index === upcoming.length - 1} aria-label="Следующий матч"><Icon name="back" className="chevron-right" /></button></div>}
    </> : <EmptyState title="Нет ближайших матчей" text={canManage(me) ? 'Открой запись на следующую игру.' : 'Организатор ещё не открыл сбор.'} action={canManage(me) && <Link className="btn primary" href="/new">Создать матч</Link>} />)}
    {(notifications.loading && !notifications.data || notifications.error || tasks.length > 0) && <section className="home-section" aria-labelledby="home-tasks"><div className="section-heading"><h2 id="home-tasks">Нужно сделать</h2><Link href="/notifications">Все задачи<Icon name="arrow" /></Link></div>
      {notifications.loading && !notifications.data && <Loading inline />}
      {notifications.error && <ErrorNote text="Не получилось обновить задачи" retry={notifications.reload} />}
      {tasks.length > 0 && <div className="task-list compact-tasks">{tasks.slice(0, 2).map(task => <TaskCard key={task.id} task={task} compact />)}</div>}
    </section>}
    {data && (upcoming.length > 1 || latest.length > 0) && <section className="home-section" aria-labelledby="home-next"><div className="section-heading"><h2 id="home-next">{upcoming.length > 1 ? 'Дальше играем' : 'Последний матч'}</h2><Link href="/matches">Все матчи<Icon name="arrow" /></Link></div>{(upcoming.length > 1 ? upcoming.slice(1, 4) : latest).map(event => <MatchRow key={event.id} event={event} />)}</section>}
  </Screen>;
}
