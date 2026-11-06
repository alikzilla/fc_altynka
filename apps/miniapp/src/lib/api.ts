import { initData } from './tg';
import { getCommunityId, getCommunityVersion } from '../state/community';

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

interface RequestOptions { communityId?: number | null; signal?: AbortSignal; }
async function call<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const communityId = options.communityId === undefined ? getCommunityId() : options.communityId;
  const version = getCommunityVersion();
  const res = await fetch(path, {
    method,
    signal: options.signal,
    headers: { Authorization: `tma ${initData()}`, ...(communityId === null ? {} : { 'X-Community-Id': String(communityId) }), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (communityId !== null && (communityId !== getCommunityId() || version !== getCommunityVersion())) throw new ApiError(409, 'context_changed');
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error');
  if (method !== 'GET') window.dispatchEvent(new Event('altynka:mutation'));
  return data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => call<T>('GET', path, undefined, options),
  send: <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => call<T>(method, path, body),
};
