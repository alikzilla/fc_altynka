/** Offset `serverNow − performance.now()`. The largest sample wins: it has the least response latency. */
let offset: number | null = null;

export function noteServerTime(serverNow: number, receivedPerf: number): void {
  const sample = serverNow - receivedPerf;
  if (offset === null || sample > offset) offset = sample;
}
export function toServerTime(perf: number): number {
  return offset === null ? Date.now() - performance.now() + perf : perf + offset;
}
export function serverNow(): number {
  return offset === null ? Date.now() : performance.now() + offset;
}
export function resetServerClock(): void {
  offset = null;
}
