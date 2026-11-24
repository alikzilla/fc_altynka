import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { ApiError } from '../src/lib/api';
import { __resetErrorReportsForTests, isNoise, isStaleChunk, reportClientError } from '../src/lib/errorReport';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  __resetErrorReportsForTests();
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); sessionStorage.clear(); });

const sentBodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

test('an error is sent once per session with its screen and stack', () => {
  const e = new TypeError('x is undefined');
  reportClientError(e, 'error');
  reportClientError(e, 'rejection');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/client-errors');
  expect(init.keepalive).toBe(true);
  expect(sentBodies()[0]).toMatchObject({ message: 'TypeError: x is undefined', path: '/', source: 'error' });
  expect(sentBodies()[0].stack).toContain('x is undefined');
});

test('a session sends at most five reports', () => {
  for (let i = 0; i < 8; i++) reportClientError(new Error(`boom ${i}`), 'error');
  expect(fetchMock).toHaveBeenCalledTimes(5);
});

test('network trouble, cancelled requests and expected server answers are not bugs', () => {
  expect(isNoise(new TypeError('Failed to fetch'))).toBe(true);
  expect(isNoise(new TypeError('Load failed'))).toBe(true);
  expect(isNoise(new DOMException('aborted', 'AbortError'))).toBe(true);
  expect(isNoise(new ApiError(409, 'stale'))).toBe(true);
  expect(isNoise('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
  expect(isNoise(new ApiError(500, 'internal'))).toBe(false);
  expect(isNoise(new TypeError('x is undefined'))).toBe(false);
  reportClientError(new TypeError('Failed to fetch'), 'rejection');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a failed report never throws', () => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('no fetch'); }));
  expect(() => reportClientError(new Error('boom'), 'error')).not.toThrow();
});

test('a stale lazy screen after a deploy is recognised', () => {
  expect(isStaleChunk(new TypeError('Failed to fetch dynamically imported module: /assets/Players-abc.js'))).toBe(true);
  expect(isStaleChunk(new TypeError('Importing a module script failed.'))).toBe(true);
  expect(isStaleChunk(new Error('boom'))).toBe(false);
});

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('render failed');
  return <p>Экран работает</p>;
}

test('a crashed screen shows a message instead of a blank page, reports it and recovers on another route', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function Harness() {
    const [route, setRoute] = useState('/a');
    return <>
      <button onClick={() => setRoute('/b')}>Другой экран</button>
      <ErrorBoundary resetKey={route}><Bomb explode={route === '/a'} /></ErrorBoundary>
    </>;
  }
  render(<Harness />);
  expect(screen.getByRole('heading', { name: 'Что-то сломалось' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeVisible();
  expect(sentBodies()).toEqual([expect.objectContaining({ message: 'Error: render failed', source: 'boundary' })]);
  expect(sentBodies()[0].stack).toContain('Bomb');
  await userEvent.click(screen.getByRole('button', { name: 'Другой экран' }));
  expect(screen.getByText('Экран работает')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Что-то сломалось' })).not.toBeInTheDocument();
});
