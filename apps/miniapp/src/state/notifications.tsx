import type { NotificationsDto } from '@altynka/core';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useResource } from '../hooks/useResource';
import { consumeScrollTarget, SHEET_PATH } from '../lib/pageTransition';

type NotificationsResource = ReturnType<typeof useResource<NotificationsDto>>;
const NotificationsContext = createContext<NotificationsResource | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const resource = useResource<NotificationsDto>('/api/notifications');
  const [path] = useLocation();
  const previousPath = useRef(path);
  useEffect(() => {
    if (previousPath.current !== path) {
      const sheetChange = SHEET_PATH.test(previousPath.current) || SHEET_PATH.test(path);
      previousPath.current = path;
      // Back returns to where the list was left (lib/pageTransition.ts); every other screen change starts at the top.
      if (!sheetChange) window.scrollTo(0, consumeScrollTarget(path));
    }
  }, [path]);
  return <NotificationsContext.Provider value={resource}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const resource = useContext(NotificationsContext);
  if (!resource) throw new Error('NotificationsProvider missing');
  return resource;
}
