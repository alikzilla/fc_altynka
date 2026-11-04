import type { NotificationsDto } from '@altynka/core';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useResource } from '../hooks/useResource';

type NotificationsResource = ReturnType<typeof useResource<NotificationsDto>>;
const NotificationsContext = createContext<NotificationsResource | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const resource = useResource<NotificationsDto>('/api/notifications');
  const [path] = useLocation();
  const previousPath = useRef(path);
  const { reload } = resource;
  useEffect(() => {
    if (previousPath.current !== path) {
      const wasSheet = previousPath.current === '/new';
      previousPath.current = path;
      reload();
      if (path !== '/new' && !wasSheet) window.scrollTo(0, 0);
    }
  }, [path, reload]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('altynka:mutation', reload);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('altynka:mutation', reload);
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [reload]);
  return <NotificationsContext.Provider value={resource}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const resource = useContext(NotificationsContext);
  if (!resource) throw new Error('NotificationsProvider missing');
  return resource;
}
