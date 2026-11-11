import { escapeHtml, formatDateRu } from '@altynka/core';
import { miniAppLink, type LinkEnv } from '../telegram/links';
import { timeRange, type Rendered } from './eventMessage';

interface TeamsView {
  date: string;
  startTime?: string | null;
  durationHours?: number | null;
  place?: string | null;
  teams: { emoji: string; name: string; players: string[] }[];
}

export function teamBlocks(teams: TeamsView['teams']): string[] {
  return teams.map(t => {
    const compact = t.players.length <= 5 && t.players.every(p => p.length <= 24) && t.players.join(' · ').length <= 90;
    return [`<b>${escapeHtml(t.emoji)} ${escapeHtml(t.name)}</b>`, t.players.join(compact ? ' · ' : '\n')].join('\n');
  });
}

/** players — уже экранированные имена (см. plainName). Уровней здесь нет и быть не должно. */
export function renderTeamsMessage(v: TeamsView, eventId?: number, env?: LinkEnv): Rendered {
  const header = [`<b>Составы · ${formatDateRu(v.date)}</b>`];
  const details = [v.startTime && v.durationHours ? timeRange(v.startTime, v.durationHours) : '', v.place ? escapeHtml(v.place) : ''].filter(Boolean);
  if (details.length) header.push(details.join(' · '));
  const html = [header.join('\n'), ...teamBlocks(v.teams)].join('\n\n');
  return env && eventId !== undefined
    ? { html, keyboard: { inline_keyboard: [[{ text: 'Открыть составы', url: miniAppLink(env, `t${eventId}`) }]] } }
    : { html };
}
