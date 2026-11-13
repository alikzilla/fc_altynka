// Kept apart from queryClient.ts: the cache module stays free of I/O, so tests can mock the API client.
import { api, ApiError } from './api';
import { keepReceivedAt, queryClient, resourceKey } from './queryClient';

/** The one way a resource is fetched, shared by screens (useResource) and by prefetch on touch. */
export async function fetchResource<T>(path: string, signal?: AbortSignal): Promise<T> {
  try {
    return await api.get<T>(path, { signal });
  } catch (error) {
    throw error instanceof ApiError ? error : new ApiError(0, 'network');
  }
}

/**
 * Shows a write before the server answers: patches the cached resource and returns the undo for a failed
 * request (null when nothing is cached). The snapshot keeps its original receipt time, so match timers
 * anchored to `serverNow` do not drift.
 */
export async function patchResource<T extends object>(path: string, update: (current: T) => T): Promise<(() => void) | null> {
  const key = resourceKey(path);
  // A refresh still in flight would overwrite the patch with older data.
  await queryClient.cancelQueries({ queryKey: key });
  const current = queryClient.getQueryData<T>(key);
  if (current === undefined) return null;
  const write = (data: T) => { queryClient.setQueryData<T>(key, data); keepReceivedAt(current, data); };
  write(update(current));
  return () => write(current);
}
