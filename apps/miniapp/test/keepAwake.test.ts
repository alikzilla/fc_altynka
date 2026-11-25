import { keepAwake } from '../src/lib/keepAwake';

afterEach(() => { Reflect.deleteProperty(navigator, 'wakeLock'); document.body.innerHTML = ''; });

test('requests a screen wake lock and releases it', async () => {
  const sentinel = { released: false, release: vi.fn().mockResolvedValue(undefined) };
  const request = vi.fn().mockResolvedValue(sentinel);
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  const handle = keepAwake();
  expect(request).toHaveBeenCalledWith('screen');
  await Promise.resolve();
  handle.release();
  expect(sentinel.release).toHaveBeenCalled();
});
test('falls back to a hidden looping video without Wake Lock', () => {
  const handle = keepAwake();
  const video = document.querySelector('video')!;
  expect(video.getAttribute('src')).toBe('/sounds/keepawake.mp4');
  expect(video.loop).toBe(true);
  handle.release();
  expect(document.querySelector('video')).toBeNull();
});
