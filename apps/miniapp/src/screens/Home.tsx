import type { EventsListDto } from '@altynka/core';
import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { Icon } from '../components/Icon';
import { MatchCard, MatchRow } from '../components/MatchCard';
import { creatableCommunities, showGroups, useMe } from '../state/me';
import { useNotifications } from '../state/notifications';
import { ConnectGroupButton, CONNECT_BOT_TEXT } from '../components/ConnectGroup';
import { TaskCard } from '../components/TaskCard';
import { ResultCard } from '../components/ResultCard';
import { todayAlmaty } from '@altynka/core';
import { Screen, EmptyState, ErrorNote, useReveal } from '../components/ui';
import { HomeMatchSkeleton, HomeTasksSkeleton } from '../components/skeletons';
import { useResource } from '../hooks/useResource';

export function Home() {
  const me = useMe();
  const { data, error, loading, reload } = useResource<EventsListDto>('/api/events');
  const notifications = useNotifications();
  const reveal = useReveal(loading && !data);
  const revealTasks = useReveal(notifications.loading && !notifications.data);
  const canCreate = creatableCommunities(me).length > 0;
  const carousel = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const upcoming = data?.active.filter(e => e.status === 'collecting' || e.status === 'scheduled' || e.status === 'playing').sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id) ?? [];
  const tasks = notifications.data?.tasks ?? [];
  const latest = data ? [...data.active.filter(e => e.status === 'billing'), ...data.past].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 1) : [];
  // A match played in the last two days leads the screen with its result until the night is wrapped up.
  const recent = latest[0]?.myResult && latest[0].date >= daysAgo(2) ? latest[0] : null;
  // The result card already offers its own payment and survey; the list keeps the rest.
  const otherTasks = recent ? tasks.filter(t => !('eventId' in t) || t.eventId !== recent.id || t.kind === 'schedule') : tasks;
  function go(direction: number) {
    const next = Math.max(0, Math.min(upcoming.length - 1, index + direction));
    const node = carousel.current?.children[next] as HTMLElement | undefined;
    if (node) carousel.current?.scrollTo({ left: node.offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  return <Screen title={recent && !upcoming.length ? 'Последний матч' : 'Ближайший матч'}>
    {recent && !upcoming.length && <ResultCard event={recent} result={recent.myResult!} tasks={tasks} />}
    {loading && !data && <HomeMatchSkeleton />}
    {error && <ErrorNote text="Не получилось загрузить сборы" retry={reload} />}
    {data && (upcoming.length ? <>
      <div className={`match-carousel ${upcoming.length === 1 ? 'single' : ''} ${reveal}`} role="region" aria-label="Ближайшие матчи" ref={carousel} onScroll={e => {
        const el = e.currentTarget;
        const first = el.children[0] as HTMLElement;
        if (first) setIndex(Math.min(upcoming.length - 1, Math.round(el.scrollLeft / (first.offsetWidth + 12))));
      }}>{upcoming.map((event, i) => <MatchCard key={event.id} event={event} index={i} />)}</div>
      {upcoming.length > 1 && <div className={`carousel-controls ${reveal}`}><button className="carousel-arrow" onClick={() => go(-1)} disabled={index === 0} aria-label="Предыдущий матч"><Icon name="back" /></button><span aria-live="polite">{index + 1} из {upcoming.length}</span><button className="carousel-arrow" onClick={() => go(1)} disabled={index === upcoming.length - 1} aria-label="Следующий матч"><Icon name="back" className="chevron-right" /></button></div>}
    </> : <EmptyState className={reveal} title="Нет ближайших матчей" text={me.communities.length === 0 ? CONNECT_BOT_TEXT : canCreate ? 'Открой запись на следующий матч.' : 'Организатор ещё не открыл сбор.'} action={me.communities.length === 0 ? <ConnectGroupButton /> : canCreate && <Link className="btn primary" href="/new">Создать матч</Link>} />)}
    {recent && upcoming.length > 0 && <ResultCard event={recent} result={recent.myResult!} tasks={tasks} />}
    {(notifications.loading && !notifications.data || notifications.error || otherTasks.length > 0) && <section className="home-section" aria-labelledby="home-tasks"><div className="section-heading"><h2 id="home-tasks">Нужно сделать</h2><Link href="/notifications">Все задачи<Icon name="arrow" /></Link></div>
      {notifications.loading && !notifications.data && <HomeTasksSkeleton groups={showGroups(me)} />}
      {notifications.error && <ErrorNote text="Не получилось обновить задачи" retry={notifications.reload} />}
      {otherTasks.length > 0 && <div className={`task-list compact-tasks ${revealTasks}`}>{otherTasks.slice(0, 2).map(task => <TaskCard key={task.id} task={task} compact />)}</div>}
    </section>}
    {data && (upcoming.length > 1 || latest.length > 0 && !recent) && <section className={`home-section ${reveal}`} aria-labelledby="home-next"><div className="section-heading"><h2 id="home-next">{upcoming.length > 1 ? 'Дальше играем' : 'Последний матч'}</h2><Link href="/matches">Все матчи<Icon name="arrow" /></Link></div>{(upcoming.length > 1 ? upcoming.slice(1, 4) : latest).map(event => <MatchRow key={event.id} event={event} />)}</section>}
  </Screen>;
}

function daysAgo(days: number): string {
  return todayAlmaty(new Date(Date.now() - days * 86_400_000));
}
