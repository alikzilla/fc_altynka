import type { MeDto } from '@altynka/core';
import { useEffect, useRef } from 'react';
import { Route, Switch, useLocation, useSearch } from 'wouter';
import { MeContext, MeReloadContext, MeUpdateContext } from './state/me';
import { NotificationsProvider } from './state/notifications';
import { Nav } from './components/Nav';
import { AddGuest } from './screens/AddGuest';
import { Event } from './screens/Event';
import { Home } from './screens/Home';
import { NewEvent } from './screens/NewEvent';
import { Players } from './screens/Players';
import { SkillAssessment, SkillsPrompt } from './screens/SkillAssessment';
import { MatchReview } from './screens/MatchReview';
import { Profile } from './screens/Profile';
import { ProfileSettings } from './screens/ProfileSettings';
import { Schedule } from './screens/Schedule';
import { Matches } from './screens/Matches';
import { Notifications } from './screens/Notifications';
import { contextForStartParam } from './lib/startParam';
import { api } from './lib/api';
import { queryClient } from './lib/queryClient';
import { ScreenSearchContext } from './state/screenSearch';
import { ready, startParam } from './lib/tg';
import { ErrorNote, Loading, ToastProvider } from './components/ui';
import { useResource } from './hooks/useResource';
import { applyTheme } from './lib/theme';

export function App() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const cleanup = ready();
    const { route, joinCommunityId } = contextForStartParam(startParam());
    if (route !== '/') navigate(route, { replace: true });
    // Joining validates membership server-side; a failure just leaves the user without that group.
    if (joinCommunityId) {
      void api.send('POST', `/api/communities/${joinCommunityId}/join`)
        .catch(() => {})
        .then(() => queryClient.invalidateQueries({ queryKey: ['api'] }));
    }
    return cleanup;
  }, [navigate]);
  return <TeamApp />;
}

function TeamApp() {
  const [path, navigate] = useLocation();
  const search = useSearch();
  const background = useRef('/matches');
  const scheduleId = /^\/event\/(\d+)\/schedule$/.exec(path)?.[1];
  if (path !== '/new' && !scheduleId) background.current = path + (search ? `?${search}` : '');
  const scheduleParent = scheduleId && background.current.split('?')[0] === `/event/${scheduleId}` ? background.current : `/event/${scheduleId}${search ? `?${search}` : ''}`;
  const { data: me, error, reload: reloadMe, replace: updateMe } = useResource<MeDto>('/api/me');
  useEffect(() => { if (me?.theme) applyTheme(me.theme); }, [me?.theme]);
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
  const overlayBackground = path === '/new' ? background.current : scheduleId ? scheduleParent : null;
  return (
    <MeContext.Provider value={me}>
      <MeReloadContext.Provider value={reloadMe}>
        <MeUpdateContext.Provider value={updateMe}>
          <ToastProvider>
            <NotificationsProvider>
              <ScreenSearchContext.Provider value={overlayBackground ? overlayBackground.split('?')[1] ?? '' : search}>
                <Switch location={overlayBackground ? overlayBackground.split('?')[0] : path}>
                  <Route path="/" component={Home} />
                  <Route path="/matches" component={Matches} />
                  <Route path="/notifications" component={Notifications} />
                  <Route path="/event/:id/guest" component={AddGuest} />
                  <Route path="/event/:id/schedule"><Schedule /></Route>
                  <Route path="/event/:id/review"><MatchReview /></Route>
                  <Route path="/event/:id" component={Event} />
                  <Route path="/players/:userId">{params => <Players selectedUserId={Number(params.userId)} />}</Route>
                  <Route path="/players"><Players /></Route>
                  <Route path="/profile/skills" component={SkillAssessment} />
                  <Route path="/profile/settings/:section">{params => <ProfileSettings section={params.section} />}</Route>
                  <Route path="/profile/settings"><ProfileSettings /></Route>
                  <Route path="/profile" component={Profile} />
                  <Route><Home /></Route>
                </Switch>
              </ScreenSearchContext.Provider>
              <Nav />
              <SkillsPrompt />
              {path === '/new' && (
                <NewEvent onClose={() => navigate(background.current, { replace: true })} />
              )}
              {scheduleId && <Schedule key={scheduleId} eventId={scheduleId} onClose={() => navigate(scheduleParent, { replace: true })} />}
            </NotificationsProvider>
          </ToastProvider>
        </MeUpdateContext.Provider>
      </MeReloadContext.Provider>
    </MeContext.Provider>
  );
}
