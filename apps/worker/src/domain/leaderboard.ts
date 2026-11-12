import { aggregatePlayerStatistics, summarizePlayerProtocol, type GameState, type LeaderboardDto, type PlayerProtocolSummary } from '@altynka/core';
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { events, memberships, users } from '../db/schema';
import { playerRatings } from './ratings';

/**
 * Итоги игроков по группам смотрящего. Считаются по тем же сохранённым протоколам, что и профиль игрока;
 * в списке только действующие участники группы, чтобы строка открывала доступный профиль.
 */
export async function leaderboard(db: Db, groups: { id: number; title: string }[], now: number): Promise<LeaderboardDto> {
  if (!groups.length) return { groups: [] };
  const ids = groups.map(g => g.id);
  const [protocols, members] = await Promise.all([
    db.select({ communityId: events.communityId, state: events.gameStateJson }).from(events)
      .where(and(inArray(events.communityId, ids), eq(events.protocolVersion, 1), isNotNull(events.startedAt),
        isNotNull(events.gameStateJson), ne(events.status, 'cancelled'))),
    db.select({ communityId: memberships.communityId, userId: memberships.userId, photoUrl: users.photoUrl }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(inArray(memberships.communityId, ids), eq(memberships.active, true))),
  ]);
  const summaries = new Map<string, PlayerProtocolSummary[]>();
  for (const row of protocols) {
    const state = JSON.parse(row.state!) as GameState;
    for (const userId of new Set(state.roster.flatMap(p => p.userId === null ? [] : [p.userId]))) {
      const summary = summarizePlayerProtocol(state, userId);
      if (!summary.games) continue;
      const key = `${row.communityId}:${userId}`;
      summaries.set(key, [...summaries.get(key) ?? [], summary]);
    }
  }
  const played = members.filter(m => summaries.has(`${m.communityId}:${m.userId}`));
  const people = await playerRatings(db, played.map(m => m.userId), now);
  return { groups: groups.map(community => ({
    community: { id: community.id, title: community.title },
    players: played.filter(m => m.communityId === community.id).flatMap(m => {
      const person = people.get(m.userId);
      if (!person) return [];
      const { meetings, games, goals, assists, assistsTracked, wins } = aggregatePlayerStatistics(summaries.get(`${community.id}:${m.userId}`)!);
      return [{ userId: m.userId, displayName: person.displayName, photoUrl: m.photoUrl, rating: person.rating.value, meetings, games, goals, assists, assistsTracked, wins }];
    }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru') || a.userId - b.userId),
  })) };
}
