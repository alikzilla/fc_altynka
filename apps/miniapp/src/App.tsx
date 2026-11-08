import type { MeDto } from '@altynka/core';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { Redirect, Route, Switch, useLocation, useSearch } from 'wouter';
import { MeContext, MeReloadContext, MeUpdateContext } from './state/me';
import { NotificationsProvider } from './state/notifications';
import { Nav } from './components/Nav';
import { Event } from './screens/Event';
import { Home } from './screens/Home';
import { Profile } from './screens/Profile';
import { Matches } from './screens/Matches';
import { Notifications } from './screens/Notifications';
import { SkillsPrompt } from './components/SkillsPrompt';

// Rarely visited screens load on demand; the first paint carries Home, Matches, the match page and Profile.
const NewEvent = lazy(() => import('./screens/NewEvent').then(m => ({ default: m.NewEvent })));
const Players = lazy(() => import('./screens/Players').then(m => ({ default: m.Players })));
const SkillAssessment = lazy(() => import('./screens/SkillAssessment').then(m => ({ default: m.SkillAssessment })));
const MatchReview = lazy(() => import('./screens/MatchReview').then(m => ({ default: m.MatchReview })));
const Schedule = lazy(() => import('./screens/Schedule').then(m => ({ default: m.Schedule })));
import { contextForStartParam } from './lib/startParam';
import { api } from './lib/api';
import { queryClient } from './lib/queryClient';
import { ScreenSearchContext } from './state/screenSearch';
import { ready, startParam } from './lib/tg';
import { ErrorNote, Loading, ToastProvider } from './components/ui';
import { useResource } from './hooks/useResource';
import { applyTheme } from './lib/theme';
import { rememberOrigin } from './lib/navHistory';

export function App() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const cleanup = ready();
    const { route, joinCommunityId } = contextForStartParam(startParam());
    if (route !== '/') navigate(route, { replace: true });
    // Joining validates membership server-side; a failure just leaves the user without that group.
    // The first /api/me may still be in flight (and predate the membership): a plain invalidation would
    // reuse that request, so cancel it and fetch again.
    if (joinCommunityId) {
      void api.send('POST', `/api/communities/${joinCommunityId}/join`)
        .catch(() => {})
        .then(() => queryClient.cancelQueries({ queryKey: ['api'] }))
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
  rememberOrigin(path);
  const scheduleParent = scheduleId && background.current.split('?')[0] === `/event/${scheduleId}` ? background.current : `/event/${scheduleId}${search ? `?${search}` : ''}`;
  const { data: me, error, reload: reloadMe, replace: updateMe } = useResource<MeDto>('/api/me');
  useEffect(() => { if (me?.theme) applyTheme(me.theme); }, [me?.theme]);
  // /api/me works without any group, so only a missing Telegram session or the network can fail it.
  if (error && (!me || error.status === 401)) {
    const text = error.status === 401 ? 'Открой мини-апп из Telegram' : 'Нет связи, попробуй позже';
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
                <Suspense fallback={<main className="screen"><Loading variant="detail" /></main>}>
                <Switch location={overlayBackground ? overlayBackground.split('?')[0] : path}>
                  <Route path="/" component={Home} />
                  <Route path="/matches" component={Matches} />
                  <Route path="/notifications" component={Notifications} />
                  <Route path="/event/:id/schedule"><Schedule /></Route>
                  <Route path="/event/:id/review"><MatchReview /></Route>
                  <Route path="/event/:id" component={Event} />
                  <Route path="/players/:userId">{params => <Players selectedUserId={Number(params.userId)} />}</Route>
                  <Route path="/players"><Players /></Route>
                  <Route path="/profile/skills"><SkillAssessment /></Route>
                  <Route path="/profile/settings/:section">{params => <Profile settings={params.section} />}</Route>
                  <Route path="/profile/settings"><Redirect to="/profile" /></Route>
                  <Route path="/profile"><Profile /></Route>
                  <Route><Home /></Route>
                </Switch>
                </Suspense>
              </ScreenSearchContext.Provider>
              <Nav />
              <SkillsPrompt />
              <Suspense fallback={null}>
                {path === '/new' && (
                  <NewEvent onClose={() => navigate(background.current, { replace: true })} />
                )}
                {scheduleId && <Schedule key={scheduleId} eventId={scheduleId} onClose={() => navigate(scheduleParent, { replace: true })} />}
              </Suspense>
            </NotificationsProvider>
          </ToastProvider>
        </MeUpdateContext.Provider>
      </MeReloadContext.Provider>
    </MeContext.Provider>
  );
}
