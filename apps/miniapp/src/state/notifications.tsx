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
  useEffect(() => {
    if (previousPath.current !== path) {
      const wasSheet = previousPath.current === '/new';
      previousPath.current = path;
      if (path !== '/new' && !wasSheet) window.scrollTo(0, 0);
    }
  }, [path]);
  return <NotificationsContext.Provider value={resource}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const resource = useContext(NotificationsContext);
  if (!resource) throw new Error('NotificationsProvider missing');
  return resource;
}
