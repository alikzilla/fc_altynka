import type { NotificationsDto } from '@altynka/core';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useResource } from '../hooks/useResource';

type NotificationsResource = ReturnType<typeof useResource<NotificationsDto>>;
const NotificationsContext = createContext<NotificationsResource | null>(null);
// Bottom sheets with their own route sit over the page underneath; opening or closing one keeps its scroll.
const SHEET_PATH = /^\/(?:new|event\/\d+\/schedule|profile\/settings\/[^/]+|players\/\d+)$/;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const resource = useResource<NotificationsDto>('/api/notifications');
  const [path] = useLocation();
  const previousPath = useRef(path);
  useEffect(() => {
    if (previousPath.current !== path) {
      const sheetChange = SHEET_PATH.test(previousPath.current) || SHEET_PATH.test(path);
      previousPath.current = path;
      if (!sheetChange) window.scrollTo(0, 0);
    }
  }, [path]);
  return <NotificationsContext.Provider value={resource}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const resource = useContext(NotificationsContext);
  if (!resource) throw new Error('NotificationsProvider missing');
  return resource;
}
