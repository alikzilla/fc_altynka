import type { EventsListDto, MatchArchiveDto } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useScreenSearch } from '../state/screenSearch';
import { api } from '../lib/api';
import { datePart, MatchRow } from '../components/MatchCard';
import { canManage, useMe } from '../state/me';
import { Screen, EmptyState, ErrorNote, Loading } from '../components/ui';
import { useResource } from '../hooks/useResource';

function ActiveMatches() {
  const me = useMe();
  const { data, loading, error, reload } = useResource<EventsListDto>('/api/events');
  const events = data?.active.filter(event => event.status === 'collecting' || event.status === 'scheduled' || event.status === 'playing').sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id) ?? [];
  return <>
    {loading && !data && <Loading />}
    {error && <ErrorNote text="Не получилось загрузить активные матчи" retry={reload} />}
    {data && (events.length ? <><p className="muted">Открытые сборы и назначенные игры</p><div className="card archive-list material-blue">{events.map(event => <MatchRow key={event.id} event={event} />)}</div></> : <EmptyState title="Нет активных матчей" text={canManage(me) ? 'Открой запись на следующую игру.' : 'Организатор ещё не открыл сбор.'} action={canManage(me) && <Link href="/new" className="btn primary">Создать матч</Link>} />)}
  </>;
}

function PastMatches() {
  const { data, loading, error, reload } = useResource<MatchArchiveDto>('/api/matches');
  const [pages, setPages] = useState<MatchArchiveDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const locked = useRef(false);
  const live = useRef(true);
  const snapshot = useRef(data);
  snapshot.current = data;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { setPages([]); setMoreError(false); }, [data]);
  const events = [...new Map([...(data?.events ?? []), ...pages.flatMap(page => page.events)].map(event => [event.id, event])).values()];
  const cursor = pages.length ? pages[pages.length - 1].nextCursor : data?.nextCursor;
  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const month = event.date.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), event]);
  }
  async function more() {
    if (!cursor || locked.current) return;
    const base = data;
    locked.current = true;
    setBusy(true);
    setMoreError(false);
    try {
      const page = await api.get<MatchArchiveDto>(`/api/matches?cursor=${encodeURIComponent(cursor)}`);
      if (live.current && snapshot.current === base) setPages(previous => [...previous, page]);
    } catch { if (live.current && snapshot.current === base) setMoreError(true); }
    finally { locked.current = false; if (live.current) setBusy(false); }
  }
  return <>
    {loading && !data && <Loading />}
    {error && <ErrorNote text="Не получилось загрузить прошлые матчи" retry={reload} />}
    {data && !events.length && <EmptyState title="Прошлых матчей пока нет" text="После игры здесь останутся составы и счёт." />}
    {[...groups].map(([month, rows], index) => <section className="archive-month" key={month} aria-labelledby={`month-${month}`}><h2 id={`month-${month}`}>{datePart(`${month}-01`, { month: 'long', year: 'numeric' }).replace(' г.', '')}</h2><div className={`card archive-list ${index % 2 ? 'material-blue' : 'material-graphite'}`}>{rows.map(event => <MatchRow key={event.id} event={event} />)}</div></section>)}
    {moreError && <p className="field-error" role="alert">Не получилось загрузить следующие матчи</p>}
    {cursor && <button className="btn wide" onClick={more} disabled={busy || loading}>{busy ? 'Загружаем…' : moreError ? 'Повторить загрузку' : 'Показать ещё'}</button>}
  </>;
}

// The chosen tab outlives the screen: coming back from a match (back arrow or bottom nav) must not reset it.
const VIEW_KEY = 'altynka:matches-view';
const readPast = () => { try { return sessionStorage.getItem(VIEW_KEY) === 'past'; } catch { return false; } };
const rememberPast = (past: boolean) => { try { sessionStorage.setItem(VIEW_KEY, past ? 'past' : 'active'); } catch { /* storage unavailable */ } };

export function Matches() {
  const search = useScreenSearch();
  const [, navigate] = useLocation();
  const view = new URLSearchParams(search).get('view');
  const past = view ? view === 'past' : readPast();
  function choose(value: boolean, focus = false) {
    rememberPast(value);
    navigate(value ? '/matches?view=past' : '/matches?view=active', { replace: true });
    if (focus) document.getElementById(value ? 'matches-past' : 'matches-active')?.focus();
  }
  return <Screen title="Матчи">
    <div className="tabs match-tabs" role="tablist" aria-label="Матчи команды">{([false, true] as const).map(value => <button key={String(value)} role="tab" id={value ? 'matches-past' : 'matches-active'} aria-selected={past === value} aria-controls="matches-panel" tabIndex={past === value ? 0 : -1} className={past === value ? 'on' : ''} onClick={() => choose(value)} onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      choose(e.key === 'Home' ? false : e.key === 'End' ? true : !value, true);
    }}>{value ? 'Прошлые' : 'Активные'}</button>)}</div>
    <div className="tab-panel matches-panel" id="matches-panel" role="tabpanel" aria-labelledby={past ? 'matches-past' : 'matches-active'}>{past ? <PastMatches /> : <ActiveMatches />}</div>
  </Screen>;
}
