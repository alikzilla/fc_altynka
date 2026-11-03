import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setLoading(true);
    api
      .get<T>(path)
      .then(d => live && (setData(d), setError(undefined)))
      .catch(e => live && setError(e instanceof ApiError ? e : new ApiError(0, 'network')))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { data, error, loading, reload };
}
