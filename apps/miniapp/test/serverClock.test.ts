import { noteServerTime, resetServerClock, serverNow, toServerTime } from '../src/lib/serverClock';

beforeEach(() => resetServerClock());
afterEach(() => vi.restoreAllMocks());

test('without samples the clock falls back to Date.now', () => {
  vi.spyOn(Date, 'now').mockReturnValue(123_456);
  expect(serverNow()).toBe(123_456);
});
test('keeps the maximum offset, i.e. the sample with the least latency', () => {
  noteServerTime(10_000, 100);
  noteServerTime(10_050, 200);
  expect(toServerTime(500)).toBe(10_400);
  vi.spyOn(performance, 'now').mockReturnValue(1_000);
  expect(serverNow()).toBe(10_900);
});
test('a change of the device wall clock does not move the estimate', () => {
  noteServerTime(10_000, 100);
  vi.spyOn(performance, 'now').mockReturnValue(1_000);
  const before = serverNow();
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60_000);
  expect(serverNow()).toBe(before);
});
