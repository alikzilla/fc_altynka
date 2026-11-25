import { keepAwake } from '../src/lib/keepAwake';

afterEach(() => { Reflect.deleteProperty(navigator, 'wakeLock'); document.body.innerHTML = ''; });

test('requests a screen wake lock and releases it', async () => {
  const sentinel = { released: false, release: vi.fn().mockResolvedValue(undefined) };
  const request = vi.fn().mockResolvedValue(sentinel);
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  const handle = keepAwake();
  expect(request).toHaveBeenCalledWith('screen');
  await vi.waitFor(() => { handle.release(); expect(sentinel.release).toHaveBeenCalled(); });
});
test('falls back to a hidden looping video without Wake Lock', () => {
  const handle = keepAwake();
  const video = document.querySelector('video')!;
  expect(video.getAttribute('src')).toBe('/sounds/keepawake.mp4');
  expect(video.loop).toBe(true);
  handle.release();
  expect(document.querySelector('video')).toBeNull();
});

const visible = () => document.dispatchEvent(new Event('visibilitychange'));
test('visible events while a request is pending do not acquire a second lock', async () => {
  const sentinel = { released: false, release: vi.fn().mockResolvedValue(undefined) };
  let resolve!: (s: typeof sentinel) => void;
  const request = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  const handle = keepAwake();
  visible(); visible();
  expect(request).toHaveBeenCalledTimes(1);
  resolve(sentinel);
  await vi.waitFor(() => { visible(); expect(request).toHaveBeenCalledTimes(1); });
  handle.release();
  await vi.waitFor(() => expect(sentinel.release).toHaveBeenCalledTimes(1));
});
test('a rejected request is retried on the next visible event without the video fallback', async () => {
  const sentinel = { released: false, release: vi.fn().mockResolvedValue(undefined) };
  const request = vi.fn().mockRejectedValueOnce(new Error('NotAllowedError')).mockResolvedValue(sentinel);
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  const handle = keepAwake();
  await vi.waitFor(() => { visible(); expect(request).toHaveBeenCalledTimes(2); });
  expect(document.querySelector('video')).toBeNull();
  handle.release();
});
