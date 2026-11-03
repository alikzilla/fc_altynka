import type { MeDto } from '@altynka/core';
import { useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { MeContext, MeReloadContext } from './me';
import { Nav } from './Nav';
import { AddGuest } from './screens/AddGuest';
import { Event } from './screens/Event';
import { Home } from './screens/Home';
import { NewEvent } from './screens/NewEvent';
import { Players } from './screens/Players';
import { Profile } from './screens/Profile';
import { Schedule } from './screens/Schedule';
import { routeForStartParam } from './startParam';
import { ready, startParam } from './tg';
import { ErrorNote, Loading, ToastProvider } from './ui';
import { useResource } from './useResource';

export function App() {
  const [, navigate] = useLocation();
  const { data: me, error, reload: reloadMe } = useResource<MeDto>('/api/me');
  useEffect(() => {
    ready();
    const r = routeForStartParam(startParam());
    if (r !== '/') navigate(r, { replace: true });
  }, [navigate]);
  if (error) {
    const text =
      error.status === 403
        ? 'Мини-апп доступен только участникам группы'
        : error.status === 401
          ? 'Открой мини-апп из Telegram'
          : error.status === 503
            ? 'Бот ещё не привязан к группе'
            : 'Нет связи, попробуй позже';
    return (
      <main className="screen">
        <ErrorNote text={text} />
      </main>
    );
  }
  if (!me) return <Loading />;
  return (
    <MeContext.Provider value={me}>
      <MeReloadContext.Provider value={reloadMe}>
      <ToastProvider>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/new" component={NewEvent} />
          <Route path="/event/:id/guest" component={AddGuest} />
          <Route path="/event/:id/schedule" component={Schedule} />
          <Route path="/event/:id" component={Event} />
          <Route path="/players" component={Players} />
          <Route path="/profile" component={Profile} />
          <Route>
            <Home />
          </Route>
        </Switch>
        <Nav />
      </ToastProvider>
      </MeReloadContext.Provider>
    </MeContext.Provider>
  );
}
