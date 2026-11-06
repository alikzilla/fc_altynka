import { matchStartsAt } from '@altynka/core';

const local = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23',
});

/** Payment and review messages wait until 10:00; 21:00 is already quiet time. */
export function nextDeliveryTime(at: number): number {
  const p = Object.fromEntries(local.formatToParts(at).map(part => [part.type, part.value]));
  const hour = Number(p.hour);
  if (hour >= 10 && hour < 21) return at;
  const date = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + (hour >= 21 ? 1 : 0)))
    .toISOString().slice(0, 10);
  return matchStartsAt({ date, startTime: '10:00' })!;
}
