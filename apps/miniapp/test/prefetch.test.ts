import { prefetch, trackPrefetch } from '../src/lib/prefetch';
import { queryClient, resourceKey } from '../src/lib/queryClient';

const fetchMock = vi.fn(async () => Response.json({ id: 7 }));
beforeEach(() => { fetchMock.mockClear(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

test('touching a match link starts loading the match before the tap ends', async () => {
  trackPrefetch();
  const link = document.createElement('a');
  link.href = '/event/7?tab=bill';
  link.innerHTML = '<span>Открыть матч</span>';
  document.body.append(link);
  link.firstElementChild!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await vi.waitFor(() => expect(queryClient.getQueryData(resourceKey('/api/events/7'))).toEqual({ id: 7 }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  link.remove();
});

test('fresh cached data and foreign links are not requested', async () => {
  queryClient.setQueryData(resourceKey('/api/events/8'), { id: 8 });
  prefetch('/event/8');
  prefetch('https://t.me/fc_altynka_news');
  prefetch('/matches');
  await Promise.resolve();
  expect(fetchMock).not.toHaveBeenCalled();
});
