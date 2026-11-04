import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';

type Resource<T> = { path: string | null; data?: T; error?: ApiError; loading: boolean };

export function useResource<T>(path: string | null) {
  const [state, setState] = useState<Resource<T>>({ path, loading: !!path });
  const [tick, setTick] = useState(0);
  const revision = useRef(0);
  const currentPath = useRef(path);
  currentPath.current = path;
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    if (!path) return;
    let live = true;
    const requestedRevision = ++revision.current;
    setState(previous => ({ path, data: previous.path === path ? previous.data : undefined, loading: true }));
    api.get<T>(path)
      .then(data => { if (live && requestedRevision === revision.current) setState({ path, data, loading: false }); })
      .catch(error => {
        if (live && requestedRevision === revision.current) setState(previous => ({ path, data: previous.data, error: error instanceof ApiError ? error : new ApiError(0, 'network'), loading: false }));
      });
    return () => { live = false; };
  }, [path, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  const replace = useCallback((data: T | ((current: T) => T)) => {
    if (currentPath.current !== path) return;
    if (typeof data === 'function' && (latest.current.path !== path || latest.current.data === undefined)) return;
    ++revision.current;
    setState(previous => ({ path, data: typeof data === 'function' ? (data as (current: T) => T)(previous.data!) : data, loading: false }));
  }, [path]);
  // A route change must never expose the previous event's actions while loading.
  const current = state.path === path && path !== null;
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, loading: !!path && (!current || state.loading), reload, replace };
}

/** Refresh task lists after mutations or returning from Telegram/Kaspi. */
export function useResourceRefresh(reload: () => void) {
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
}
