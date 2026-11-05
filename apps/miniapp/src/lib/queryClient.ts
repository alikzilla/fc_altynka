import { QueryClient } from '@tanstack/react-query';

// Keep the monotonic receipt time with cached match snapshots, including list entries.
const receivedAt = new WeakMap<object, number>();
export const resourceReceivedAt = (data: object) => receivedAt.get(data);

function rememberReceipt(data: unknown, elapsed: number) {
  if (!data || typeof data !== 'object') return;
  if ('serverNow' in data && typeof data.serverNow === 'number') {
    receivedAt.set(data, elapsed);
    return;
  }
  for (const value of Object.values(data)) rememberReceipt(value, elapsed);
}

/**
 * Shared cache. Data stays fresh for a minute, so moving between screens does not refetch;
 * mutations (see `altynka:mutation`) and returning to the app after the data went stale do.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, gcTime: 10 * 60_000, retry: false, refetchOnWindowFocus: true, refetchOnReconnect: true } },
});

queryClient.getQueryCache().subscribe(event => {
  if (event.type === 'updated' && event.action.type === 'success' && event.query.queryKey[0] === 'api') {
    rememberReceipt(event.query.state.data, performance.now());
  }
});

export const resourceKey = (path: string | null) => ['api', path] as const;

// Any successful write may change lists, tasks and details: mark everything stale, refetch what is on screen.
if (typeof window !== 'undefined') window.addEventListener('altynka:mutation', () => { void queryClient.invalidateQueries({ queryKey: ['api'] }); });
