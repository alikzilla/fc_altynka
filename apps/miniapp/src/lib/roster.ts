import { splitQueue, type EventDetailDto, type SignupDto } from '@altynka/core';

/**
 * The list as the server will have it once a signup is gone: strictly in signup order, the first `limit`
 * are in the main roster, so the first reservist moves up. Used to show a leave or a removal at the tap.
 */
export function withoutSignup(ev: EventDetailDto, gone: (s: SignupDto) => boolean, myUserId: number): EventDetailDto {
  const { main, reserve } = splitQueue([...ev.main, ...ev.reserve].filter(s => !gone(s)), ev.limit);
  const my = main.some(s => s.userId === myUserId) ? 'main' : reserve.some(s => s.userId === myUserId) ? 'reserve' : null;
  return { ...ev, main, reserve, mainCount: main.length, reserveCount: reserve.length, my };
}
