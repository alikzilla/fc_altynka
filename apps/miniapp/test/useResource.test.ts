import { act, renderHook, waitFor } from '@testing-library/react';
import type { Mock } from 'vitest';
import { api } from '../src/lib/api';
import { useResource } from '../src/hooks/useResource';

vi.mock('../src/lib/api', async orig => ({ ...(await orig<typeof import('../src/lib/api')>()), api: { get: vi.fn(), send: vi.fn() } }));

test('changing event routes hides old data and ignores an out-of-order response', async () => {
  let resolveOld!: (value: string) => void;
  (api.get as Mock).mockImplementation((path: string) => path === '/old' ? new Promise<string>(resolve => { resolveOld = resolve; }) : Promise.resolve('new event'));
  const { result, rerender } = renderHook(({ path }) => useResource<string>(path), { initialProps: { path: '/old' } });
  rerender({ path: '/new' });
  expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(result.current.data).toBe('new event'));
  await act(async () => resolveOld('old event'));
  expect(result.current.data).toBe('new event');
});

test('cached content is retained for a failed refresh, but not for another route', async () => {
  (api.get as Mock).mockResolvedValueOnce('first event').mockRejectedValueOnce(new Error('offline')).mockReturnValue(new Promise(() => {}));
  const { result, rerender } = renderHook(({ path }) => useResource<string>(path), { initialProps: { path: '/first' } });
  await waitFor(() => expect(result.current.data).toBe('first event'));
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.error?.code).toBe('network'));
  expect(result.current.data).toBe('first event');
  rerender({ path: '/second' });
  expect(result.current.data).toBeUndefined();
  expect(result.current.error).toBeUndefined();
  expect(result.current.loading).toBe(true);
});

test('a saved response replaces cached data immediately and supersedes a pending old refresh', async () => {
  let resolveOld!: (value: string) => void;
  (api.get as Mock).mockResolvedValueOnce('old').mockImplementationOnce(() => new Promise<string>(resolve => { resolveOld = resolve; })).mockResolvedValueOnce('latest');
  const { result } = renderHook(() => useResource<string>('/me'));
  await waitFor(() => expect(result.current.data).toBe('old'));
  act(() => result.current.reload());
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  expect(result.current.replace).toBeTypeOf('function');
  act(() => result.current.replace('saved'));
  expect(result.current.data).toBe('saved');
  await act(async () => resolveOld('stale'));
  expect(result.current.data).toBe('saved');
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.data).toBe('latest'));
});

test('field-scoped saved responses merge into the current cache instead of overwriting independent changes', async () => {
  (api.get as Mock).mockResolvedValue({ phone: null, notifications: false });
  const { result } = renderHook(() => useResource<{ phone: string | null; notifications: boolean }>('/me'));
  await waitFor(() => expect(result.current.data).toEqual({ phone: null, notifications: false }));
  act(() => {
    result.current.replace(current => ({ ...current, phone: '+77071234567' }));
    result.current.replace(current => ({ ...current, notifications: true }));
  });
  expect(result.current.data).toEqual({ phone: '+77071234567', notifications: true });
});
