import { TEAMS } from '@altynka/core';
import type { Db } from '../db/client';
import { getEvent } from '../domain/events';
import { teamsDto } from '../domain/teams';
import { plainName, type Rendered } from '../render/eventMessage';
import { renderTeamsMessage } from '../render/teamsMessage';
import type { LinkEnv } from '../telegram/links';
import { loadEventView } from './parts';

export async function renderTeamsPart(db: Db, eventId: number, env?: LinkEnv): Promise<Rendered | null> {
  const ev = await getEvent(db, eventId);
  const view = await loadEventView(db, eventId);
  if (!ev?.teamsPublishedAt || !view) return null;
  const dto = await teamsDto(db, eventId, view.main.map(p => p.signupId));
  if (!dto) return null;
  const all = [...view.main, ...view.reserve];
  return renderTeamsMessage({
    date: ev.date,
    startTime: ev.startTime,
    durationHours: ev.durationHours,
    place: ev.place,
    teams: dto.teams.map((ids, i) => ({
      emoji: TEAMS[i].emoji,
      name: TEAMS[i].name,
      players: ids.map(id => all.find(p => p.signupId === id)).filter(p => !!p).map(p => plainName(p!)),
    })),
  }, eventId, env);
}
