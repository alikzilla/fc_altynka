import { formatRating, leaderboardValue, mergeLeaderboard, plural, rankLeaderboard, type LeaderboardBoard, type LeaderboardDto, type LeaderboardRowDto } from '@altynka/core';
import { useState } from 'react';
import { EmptyState, ErrorNote, Screen, useReveal } from '../components/ui';
import { StatisticsSkeleton } from '../components/skeletons';
import { GROUP_COLORS } from '../components/GroupTag';
import { Avatar } from '../components/Icon';
import { useResource } from '../hooks/useResource';
import { useMe } from '../state/me';
import { PlayerProfileSheet } from './PlayerProfile';

export const BOARDS: [LeaderboardBoard, string][] = [['goals', 'Голы'], ['assists', 'Пасы'], ['points', 'Гол+пас'], ['games', 'Игры'], ['wins', 'Победы']];

const MEDALS = ['gold', 'silver', 'bronze'] as const;

export function Statistics() {
  const me = useMe();
  const { data, error, loading, reload } = useResource<LeaderboardDto>('/api/statistics');
  const [communityId, setCommunityId] = useState<number | null>(null);
  const [board, setBoard] = useState<LeaderboardBoard>('goals');
  const [opened, setOpened] = useState<number | null>(null);
  const reveal = useReveal(loading && !data);
  const groups = data?.groups ?? [];
  // A group the person has just left must not keep an empty filter selected.
  const selected = groups.some(g => g.community.id === communityId) ? communityId : null;
  const rows = rankLeaderboard(mergeLeaderboard(groups, selected), board);
  const podium = rows.length >= 3 ? rows.slice(0, 3) : [];
  const value = (row: LeaderboardRowDto) => leaderboardValue(row, board) ?? '—';
  const label = BOARDS.find(([key]) => key === board)![1];
  return <Screen title="Статистика" back="/">
    {groups.length > 1 && <div className="stat-groups" role="group" aria-label="Группа">
      <button type="button" className={`chip-btn ${selected === null ? 'on' : ''}`} aria-pressed={selected === null} onClick={() => setCommunityId(null)}>Все игроки</button>
      {groups.map(({ community }) => <button type="button" key={community.id} className={`chip-btn ${selected === community.id ? 'on' : ''}`} aria-pressed={selected === community.id} onClick={() => setCommunityId(community.id)}>
        <i aria-hidden="true" style={{ background: GROUP_COLORS[community.id % GROUP_COLORS.length] }} />{community.title}</button>)}
    </div>}
    <div className="tabs stat-boards" role="group" aria-label="Показатель">
      {BOARDS.map(([key, text]) => <button type="button" key={key} className={board === key ? 'on' : ''} aria-pressed={board === key} onClick={() => setBoard(key)}>{text}</button>)}
    </div>
    {loading && !data && <StatisticsSkeleton />}
    {error && <ErrorNote text="Не получилось загрузить статистику" retry={reload} />}
    {data && !rows.length && <EmptyState className={reveal} title="Статистики пока нет" text="Она появится после первого матча, где организатор записал результаты игр." />}
    {podium.length > 0 && <ol className={`stat-podium ${reveal}`} aria-label={`Лидеры: ${label}`}>
      {podium.map((row, index) => <li key={row.userId} className={index === 0 ? 'first' : index === 1 ? 'second' : 'third'}>
        <button type="button" className="stat-pod" data-medal={MEDALS[index]} onClick={() => setOpened(row.userId)}>
          <span className="stat-place">{index + 1} место</span>
          <Avatar name={row.displayName} photoUrl={row.photoUrl} />
          <b>{row.displayName}</b>
          <span className="stat-pod-value">{value(row)}</span>
        </button>
      </li>)}
    </ol>}
    {rows.length > podium.length && <ol className={`card list stat-list ${reveal}`} start={podium.length + 1} aria-label={`Таблица: ${label}`}>
      {rows.slice(podium.length).map((row, index) => <li key={row.userId}>
        <button type="button" className={`btn-plain stat-row ${row.userId === me.userId ? 'is-me' : ''}`} onClick={() => setOpened(row.userId)}>
          <span className="stat-rank">{index + podium.length + 1}</span>
          <Avatar name={row.displayName} photoUrl={row.photoUrl} />
          <span className="stat-name"><b>{row.displayName}</b><small className="muted">{row.meetings} {plural(row.meetings, 'матч', 'матча', 'матчей')} · рейтинг {formatRating(row.rating)}</small></span>
          <span className="stat-value">{value(row)}</span>
        </button>
      </li>)}
    </ol>}
    {rows.length > 0 && <p className="muted stat-note">Считаются короткие игры из протоколов матчей. Пасы записываются не с самого начала: у тех, чьи игры были раньше, стоит «—».</p>}
    {opened !== null && <PlayerProfileSheet key={opened} userId={opened} onClose={() => setOpened(null)} />}
  </Screen>;
}
