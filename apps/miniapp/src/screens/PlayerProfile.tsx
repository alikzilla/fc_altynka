import { dominantFootLabel, playingPositionLabel, type PlayerProfileDto } from '@altynka/core';
import { ActionSheet } from '../components/ActionSheet';
import { Avatar } from '../components/Icon';
import { RatingHistory, InlineRating } from '../components/PlayerRating';
import { ErrorNote, Loading } from '../components/ui';
import { useResource } from '../hooks/useResource';

export function PlayerProfileSheet({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data, error, loading, reload } = useResource<PlayerProfileDto>(`/api/players/${userId}`);
  return <ActionSheet title="Профиль игрока" onClose={onClose}>
    {loading && !data && <Loading />}
    {error && <ErrorNote text={error.status === 404 ? 'Игрок не найден в команде' : 'Не получилось загрузить профиль'} retry={reload} />}
    {data && <div className="player-profile-content">
      <section className="card material-plum player-profile-identity"><div className="player-profile-person"><Avatar name={data.displayName} large /><div><h3>{data.displayName}</h3><p className="muted">{data.playingPosition ? playingPositionLabel[data.playingPosition] : 'Позиция не указана'} · {data.dominantFoot ? `${dominantFootLabel[data.dominantFoot].toLocaleLowerCase('ru')} нога` : 'Рабочая нога не указана'}</p></div></div><InlineRating rating={data.rating} /></section>
      <RatingHistory history={data.history} />
    </div>}
  </ActionSheet>;
}
