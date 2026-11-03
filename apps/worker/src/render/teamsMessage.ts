import { formatDateRu } from '@sbor/core';
import type { Rendered } from './eventMessage';

/** players — уже экранированные имена (см. plainName). Уровней здесь нет и быть не должно. */
export function renderTeamsMessage(v: { date: string; teams: { emoji: string; name: string; players: string[] }[] }): Rendered {
  const blocks = v.teams.map(t => [`<b>${t.emoji} ${t.name}</b>`, ...t.players].join('\n'));
  return { html: [`👕 <b>Составы · ${formatDateRu(v.date)}</b>`, ...blocks].join('\n\n') };
}
