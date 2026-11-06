import type { GameRosterPlayer, SignupDto } from '@altynka/core';

/** Equal names remain separate people; an inviter is the most useful guest disambiguation. */
export function gamePlayerName(person: GameRosterPlayer, roster: readonly GameRosterPlayer[], main: readonly SignupDto[] = []): string {
  if (roster.filter(p=>p.name===person.name).length<2) return person.name;
  const inviter=main.find(p=>p.id===person.signupId)?.guestOfName;
  return `${person.name} · ${inviter ?? `№${person.signupId}`}`;
}
