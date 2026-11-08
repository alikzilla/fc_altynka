import type { PlayerProfileDto } from '@altynka/core';
import { ActionSheet } from '../components/ActionSheet';
import { PlayerAchievements, PlayerSportsCard } from '../components/PlayerSports';
import { PlayerGameHistory } from '../components/PlayerGameHistory';
import { ErrorNote, Loading } from '../components/ui';
import { useResource } from '../hooks/useResource';

export function PlayerProfileSheet({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data, error, loading, reload } = useResource<PlayerProfileDto>(`/api/players/${userId}`);
  return <ActionSheet title="Профиль игрока" onClose={onClose}>
    {loading && !data && <Loading />}
    {error && <ErrorNote text={error.status === 404 ? 'Игрок не найден в команде' : 'Не получилось загрузить профиль'} retry={reload} />}
    {data && <div className="player-profile-content">
      <PlayerSportsCard name={data.displayName} username={data.telegramUsername} role={data.role??'player'} playingPosition={data.playingPosition} dominantFoot={data.dominantFoot} rating={data.rating} statistics={data.statistics}/>
      {data.statistics && <PlayerAchievements statistics={data.statistics}/>}
      <PlayerGameHistory profile={data}/>
    </div>}
  </ActionSheet>;
}
