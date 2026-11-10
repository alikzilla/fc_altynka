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

/**
 * Match, bill and game writes change lists, tasks and match details, but not the person or the player
 * directory: those refresh only after writes to the account, groups or skills. A goal recorded on the
 * pitch therefore refetches the match and tasks, not /api/me and every profile. An admin's change in
 * «Управление» (role, name, injury) is a person write: every profile and list showing that player refreshes.
 */
const PERSON_WRITE = /^\/api\/(me|communities|members|players|profile|skills)(\/|$)/;
const PERSON_READ = /^\/api\/(me|players)(\/|$)/;
export function shouldRefresh(writePath: string | undefined, readPath: unknown): boolean {
  if (typeof readPath !== 'string' || writePath === undefined || PERSON_WRITE.test(writePath)) return true;
  // A finished match changes profile statistics and ratings; a bill may save the receiver's own Kaspi number.
  if (/\/finish$|\/review$|\/bill$/.test(writePath)) return true;
  return !PERSON_READ.test(readPath);
}

if (typeof window !== 'undefined') window.addEventListener('altynka:mutation', event => {
  const writePath = (event as CustomEvent<{ path?: string } | undefined>).detail?.path;
  void queryClient.invalidateQueries({ queryKey: ['api'], predicate: query => shouldRefresh(writePath, query.queryKey[1]) });
});
