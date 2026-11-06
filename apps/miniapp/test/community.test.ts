import { act, renderHook, waitFor } from '@testing-library/react';
import { api, ApiError } from '../src/lib/api';
import { resourceKey, queryClient } from '../src/lib/queryClient';
import { getCommunityId, setCommunityId } from '../src/state/community';

afterEach(() => { setCommunityId(null); vi.restoreAllMocks(); });

test('query cache is scoped to the selected community', () => {
  setCommunityId(1);
  const a = resourceKey('/api/me');
  queryClient.setQueryData(a, { displayName: 'A' });
  setCommunityId(2);
  expect(resourceKey('/api/me')).not.toEqual(a);
  expect(queryClient.getQueryData(resourceKey('/api/me'))).toBeUndefined();
});

test('request captures its team header and discards late responses after a switch', async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  setCommunityId(1);
  const pending = api.get('/api/me').catch(error => error);
  expect(fetch).toHaveBeenCalledWith('/api/me', expect.objectContaining({ headers: expect.objectContaining({ 'X-Community-Id': '1' }) }));
  setCommunityId(2);
  finish(new Response(JSON.stringify({ displayName: 'A' })));
  const error = await pending;
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe('context_changed');
});

test('returning to the original team does not revive an obsolete request', async () => {
  let finish!: (response: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  setCommunityId(1);
  const pending = api.send('PATCH', '/api/me', { displayName: 'Old draft' }).catch(error => error);
  setCommunityId(2);
  setCommunityId(1);
  finish(new Response(JSON.stringify({ displayName: 'Old draft' })));
  expect(await pending).toBeInstanceOf(ApiError);
});
