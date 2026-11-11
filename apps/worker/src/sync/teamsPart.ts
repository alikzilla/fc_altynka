import { teamAppearance } from '@altynka/core';
import type { Db } from '../db/client';
import { getEvent } from '../domain/events';
import { teamsDto } from '../domain/teams';
import { plainName, type EventView, type PersonView, type Rendered } from '../render/eventMessage';
import { renderTeamsMessage } from '../render/teamsMessage';
import type { LinkEnv } from '../telegram/links';
import { loadEventView } from './parts';

export interface PublishedTeam { emoji: string; name: string; players: PersonView[] }

/** Опубликованные составы с людьми; null, пока составы не опубликованы. */
export async function loadPublishedTeams(db: Db, eventId: number): Promise<{ view: EventView; teams: PublishedTeam[] } | null> {
  const ev = await getEvent(db, eventId);
  const view = await loadEventView(db, eventId);
  if (!ev?.teamsPublishedAt || !view) return null;
  const dto = await teamsDto(db, eventId, view.main.map(p => p.signupId));
  if (!dto) return null;
  const all = [...view.main, ...view.reserve];
  return {
    view,
    teams: dto.teams.map((ids, i) => ({
      emoji: teamAppearance(i, dto.colors).emoji,
      name: teamAppearance(i, dto.colors).name,
      players: ids.map(id => all.find(p => p.signupId === id)).filter((p): p is PersonView => !!p),
    })),
  };
}

export async function renderTeamsPart(db: Db, eventId: number, env?: LinkEnv): Promise<Rendered | null> {
  const published = await loadPublishedTeams(db, eventId);
  if (!published) return null;
  const { view, teams } = published;
  return renderTeamsMessage({
    date: view.date,
    startTime: view.startTime,
    durationHours: view.durationHours,
    place: view.place,
    teams: teams.map(t => ({ emoji: t.emoji, name: t.name, players: t.players.map(plainName) })),
  }, eventId, env);
}
