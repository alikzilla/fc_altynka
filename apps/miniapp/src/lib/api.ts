import { initData } from './tg';
import { reportReachable } from './connection';

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  /** false: a write that changes nothing other screens show (the game timer) skips `altynka:mutation`. */
  refresh?: boolean;
}
async function call<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal: options.signal,
      headers: { Authorization: `tma ${initData()}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    // A request the app cancelled itself says nothing about the connection.
    if (!options.signal?.aborted) reportReachable(false);
    throw error;
  }
  reportReachable(true);
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error');
  if (method !== 'GET' && options.refresh !== false) window.dispatchEvent(new CustomEvent('altynka:mutation', { detail: { path } }));
  return data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => call<T>('GET', path, undefined, options),
  send: <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, options?: Pick<RequestOptions, 'refresh'>) => call<T>(method, path, body, options),
};
