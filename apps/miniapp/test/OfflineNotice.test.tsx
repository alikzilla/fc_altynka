import { act, render, screen } from '@testing-library/react';
import { OfflineNotice } from '../src/components/OfflineNotice';
import { api } from '../src/lib/api';
import { isOffline } from '../src/lib/connection';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('the browser going offline shows one notice; coming back says so briefly', async () => {
  vi.useFakeTimers();
  render(<OfflineNotice />);
  expect(screen.queryByText('Нет связи')).not.toBeInTheDocument();
  act(() => { window.dispatchEvent(new Event('offline')); });
  expect(screen.getByText('Нет связи')).toBeVisible();
  expect(screen.getByText('Обновим, когда сеть вернётся')).toBeVisible();
  expect(document.documentElement).toHaveAttribute('data-offline');
  act(() => { window.dispatchEvent(new Event('online')); });
  expect(screen.getByText('Снова на связи')).toBeVisible();
  act(() => { vi.advanceTimersByTime(2000); });
  expect(screen.queryByText('Снова на связи')).not.toBeInTheDocument();
  expect(document.documentElement).not.toHaveAttribute('data-offline');
});

test('a request without an answer counts as offline until any answer arrives, errors included', async () => {
  let up = false;
  vi.stubGlobal('fetch', vi.fn(async () => { if (!up) throw new TypeError('Failed to fetch'); return Response.json({ error: 'forbidden' }, { status: 403 }); }));
  render(<OfflineNotice />);
  await act(async () => { await api.get('/api/me').catch(() => {}); });
  expect(isOffline()).toBe(true);
  expect(screen.getByText('Нет связи')).toBeVisible();
  up = true;
  await act(async () => { await api.get('/api/me').catch(() => {}); });
  expect(isOffline()).toBe(false);
  expect(screen.getByText('Снова на связи')).toBeVisible();
});

test('a request the app cancels itself does not raise the notice', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return Response.json({});
  }));
  const controller = new AbortController();
  controller.abort();
  await api.get('/api/me', { signal: controller.signal }).catch(() => {});
  expect(isOffline()).toBe(false);
});
