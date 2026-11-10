import type { PlayerProfileDto } from '@altynka/core';
import { ActionSheet } from '../components/ActionSheet';
import { PlayerSportsCard } from '../components/PlayerSports';
import { PlayerAchievements } from '../components/PlayerAchievements';
import { PlayerGameHistory } from '../components/PlayerGameHistory';
import { ErrorNote, useReveal } from '../components/ui';
import { PlayerProfileSkeleton } from '../components/skeletons';
import { useResource } from '../hooks/useResource';

export function PlayerProfileSheet({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data, error, loading, reload } = useResource<PlayerProfileDto>(`/api/players/${userId}`);
  const reveal = useReveal(loading && !data);
  return <ActionSheet title="Профиль игрока" onClose={onClose}>
    {loading && !data && <PlayerProfileSkeleton />}
    {error && <ErrorNote text={error.status === 404 ? 'Игрок не найден в команде' : 'Не получилось загрузить профиль'} retry={reload} />}
    {data && <div className={`player-profile-content ${reveal}`}>
      <PlayerSportsCard name={data.displayName} username={data.telegramUsername} role={data.role??'player'} playingPosition={data.playingPosition} dominantFoot={data.dominantFoot} rating={data.rating} statistics={data.statistics} injured={data.injured}/>
      {data.statistics && <PlayerAchievements statistics={data.statistics} pinned={data.pinnedAchievement ?? null}/>}
      <PlayerGameHistory profile={data}/>
    </div>}
  </ActionSheet>;
}
