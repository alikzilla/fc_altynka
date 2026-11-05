import type { MeDto } from '@altynka/core';
import { useEffect, useRef } from 'react';
import { Route, Switch, useLocation, useSearch } from 'wouter';
import { canManage, MeContext, MeReloadContext, MeUpdateContext } from './state/me';
import { NotificationsProvider } from './state/notifications';
import { Nav } from './components/Nav';
import { AddGuest } from './screens/AddGuest';
import { Event } from './screens/Event';
import { Home } from './screens/Home';
import { NewEvent } from './screens/NewEvent';
import { Players } from './screens/Players';
import { Profile } from './screens/Profile';
import { ProfileSettings } from './screens/ProfileSettings';
import { Schedule } from './screens/Schedule';
import { Matches } from './screens/Matches';
import { Notifications } from './screens/Notifications';
import { routeForStartParam } from './lib/startParam';
import { ScreenSearchContext } from './state/screenSearch';
import { ready, startParam } from './lib/tg';
import { EmptyState, ErrorNote, Loading, Screen, ToastProvider } from './components/ui';
import { useResource } from './hooks/useResource';
import { applyTheme } from './lib/theme';

export function App() {
  const [path, navigate] = useLocation();
  const search = useSearch();
  const background = useRef('/matches');
  if (path !== '/new') background.current = path + (search ? `?${search}` : '');
  const { data: me, error, reload: reloadMe, replace: updateMe } = useResource<MeDto>('/api/me');
  useEffect(() => { if (me?.theme) applyTheme(me.theme); }, [me?.theme]);
  useEffect(() => {
    const cleanup = ready();
    const r = routeForStartParam(startParam());
    if (r !== '/') navigate(r, { replace: true });
    return cleanup;
  }, [navigate]);
  if (error && (!me || error.status === 401 || error.status === 403 || error.status === 503)) {
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
        <h1 className="title">FC Altynka</h1>
        <ErrorNote text={text} retry={reloadMe} />
      </main>
    );
  }
  if (!me) return <main className="screen"><h1 className="title">FC Altynka</h1><Loading variant="detail" /></main>;
  return (
    <MeContext.Provider value={me}>
      <MeReloadContext.Provider value={reloadMe}>
        <MeUpdateContext.Provider value={updateMe}>
          <ToastProvider>
            <NotificationsProvider>
              <ScreenSearchContext.Provider value={path === '/new' && canManage(me) ? background.current.split('?')[1] ?? '' : search}>
                <Switch location={path === '/new' && canManage(me) ? background.current.split('?')[0] : path}>
                  <Route path="/" component={Home} />
                  <Route path="/matches" component={Matches} />
                  <Route path="/notifications" component={Notifications} />
                  <Route path="/new">
                    <Screen title="Новый матч" back="/">
                      <EmptyState title="Матчи создают организаторы" text="Записаться на ближайшую игру можно на главной." />
                    </Screen>
                  </Route>
                  <Route path="/event/:id/guest" component={AddGuest} />
                  <Route path="/event/:id/schedule" component={Schedule} />
                  <Route path="/event/:id" component={Event} />
                  <Route path="/players">
                    {canManage(me) ? <Players /> : (
                      <Screen title="Игроки" back="/profile">
                        <EmptyState title="Только для организаторов" text="Управление составом доступно организаторам команды." />
                      </Screen>
                    )}
                  </Route>
                  <Route path="/profile/settings/:section">{params => <ProfileSettings section={params.section} />}</Route>
                  <Route path="/profile/settings"><ProfileSettings /></Route>
                  <Route path="/profile" component={Profile} />
                  <Route><Home /></Route>
                </Switch>
              </ScreenSearchContext.Provider>
              <Nav />
              {path === '/new' && canManage(me) && (
                <NewEvent onClose={() => navigate(background.current, { replace: true })} />
              )}
            </NotificationsProvider>
          </ToastProvider>
        </MeUpdateContext.Provider>
      </MeReloadContext.Provider>
    </MeContext.Provider>
  );
}
