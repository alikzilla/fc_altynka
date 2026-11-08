import { formatDateRu, plural, teamAppearance, type PlayerMeetingStatistics, type PlayerProfileDto } from '@altynka/core';
import { useState } from 'react';
import { ActionSheet } from './ActionSheet';
import { GroupTag } from './GroupTag';
import { Icon } from './Icon';
import { RatingHistory } from './PlayerRating';

const goalsText = (n: number) => `${n} ${plural(n, 'гол', 'гола', 'голов')}`;

function MeetingRow({ meeting, showGroup, onOpen }: { meeting: PlayerMeetingStatistics; showGroup: boolean; onOpen: () => void }) {
  const date = formatDateRu(meeting.date);
  return <button type="button" className="player-meeting-row" onClick={onOpen}
    aria-label={`${date}: ${goalsText(meeting.goals)}, победы ${meeting.wins}, ничьи ${meeting.draws}, поражения ${meeting.losses}`}>
    <span className="player-meeting-when">
      <strong>{date}</strong>
      <span className="player-meeting-dots" aria-hidden="true">{[...meeting.results].sort((a, b) => a.sequence - b.sequence).map(game => <i key={game.id} data-outcome={game.outcome}/>)}</span>
      {showGroup && <GroupTag community={meeting.community}/>}
    </span>
    <span className="player-meeting-goals"><b>{meeting.goals}</b> {plural(meeting.goals, 'гол', 'гола', 'голов')}</span>
    <Icon name="back" className="chevron-right"/>
  </button>;
}

export function PlayerGameHistory({profile}:{profile:PlayerProfileDto}) {
  const [selected,setSelected]=useState<PlayerMeetingStatistics|null>(null);
  const [allOpen,setAllOpen]=useState(false);
  const meetings=profile.gameHistory??[];
  const ids=new Set(meetings.map(row=>row.eventId));
  const previous=(profile.history??[]).filter(row=>row.protocolVersion!==1 && !ids.has(row.eventId));
  const showGroup=new Set(meetings.map(row=>row.community.id)).size>1;
  const rows=(list:PlayerMeetingStatistics[])=>list.map(row=><MeetingRow key={row.eventId} meeting={row} showGroup={showGroup} onOpen={()=>setSelected(row)}/>);
  return <>
    <section className="card material-graphite player-meeting-history" aria-labelledby="played-meetings-title">
      <div className="player-meeting-heading"><h2 id="played-meetings-title">Сыгранные матчи</h2>
        {meetings.length>3 && <button type="button" className="achievements-all" aria-label="Все сыгранные матчи" onClick={()=>setAllOpen(true)}>Все {meetings.length}<Icon name="back" className="chevron-right"/></button>}</div>
      {meetings.length ? <div className="player-meeting-rows">{rows(meetings.slice(0,3))}</div>
        : <div className="player-empty-history"><h3>Всё начнётся с первой игры</h3><p>Здесь появятся сыгранные матчи, результаты и забитые голы.</p></div>}
    </section>
    {previous.length>0 && <RatingHistory history={previous}/>}
    {allOpen && <ActionSheet title="Сыгранные матчи" onClose={()=>setAllOpen(false)}><div className="player-meeting-rows">{rows(meetings)}</div></ActionSheet>}
    {selected && <ActionSheet title={`Игры за ${formatDateRu(selected.date)}`} onClose={()=>setSelected(null)}>
      <p className="muted">{profile.displayName} · Игр: {selected.games} · Голов: {selected.goals}{selected.score!==null && ` · Оценка ${selected.score.toLocaleString('ru-RU',{maximumFractionDigits:1})}`}</p>
      {selected.place && <p className="muted">{selected.place}</p>}
      <div className="player-short-games">{[...selected.results].reverse().map(game=><article className="player-short-game" data-outcome={game.outcome} key={game.id}>
        <div><h3>Игра {game.sequence}</h3><p>{game.pair.map(team=>teamAppearance(team,selected.colors).name).join(' — ')}</p></div>
        <div className="player-short-result"><strong>{game.score.join(':')}</strong><p>{{win:'Победа',draw:'Ничья',loss:'Поражение'}[game.outcome]}</p></div>
        <span className="player-short-goals">{game.goals?`Голов игрока: ${game.goals}`:'Без забитых голов'}</span>
      </article>)}</div>
    </ActionSheet>}
  </>;
}
