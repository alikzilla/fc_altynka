import { formatDateRu, teamAppearance, type PlayerMeetingStatistics, type PlayerProfileDto } from '@altynka/core';
import { useState } from 'react';
import { ActionSheet } from './ActionSheet';
import { GroupTag } from './GroupTag';
import { Icon } from './Icon';
import { RatingHistory } from './PlayerRating';

export function PlayerGameHistory({profile}:{profile:PlayerProfileDto}) {
  const [selected,setSelected]=useState<PlayerMeetingStatistics|null>(null);
  const meetings=profile.gameHistory??[];
  const ids=new Set(meetings.map(row=>row.eventId));
  const previous=(profile.history??[]).filter(row=>row.protocolVersion!==1 && !ids.has(row.eventId));
  return <>
    <section className="player-meeting-history" aria-labelledby="played-meetings-title"><h2 id="played-meetings-title">Сыгранные встречи</h2>
      {meetings.length ? meetings.map(row=><article className="card player-meeting" key={row.eventId}>
        <div className="player-meeting-date"><GroupTag community={row.community}/><h3>{formatDateRu(row.date)}</h3>{row.place && <p>{row.place}</p>}</div>
        <div className="session-totals"><span><b>{row.games}</b> игр</span><span><b>{row.goals}</b> голов</span></div>
        <p className="history-results">Победы {row.wins} · Ничьи {row.draws} · Поражения {row.losses}</p>
        <div className="session-rating"><span>Оценка за встречу</span><strong>{row.score===null?'—':row.score.toLocaleString('ru-RU',{maximumFractionDigits:1})}</strong></div>
        <button type="button" className="history-link" onClick={()=>setSelected(row)}>Все короткие игры ({row.games})<Icon name="back" className="chevron-right"/></button>
      </article>) : <div className="card player-empty-history"><h3>Всё начнётся с первой игры</h3><p>Здесь появятся сыгранные встречи, результаты и забитые голы.</p></div>}
    </section>
    {previous.length>0 && <RatingHistory history={previous}/>}
    {selected && <ActionSheet title={`Игры за ${formatDateRu(selected.date)}`} onClose={()=>setSelected(null)}>
      <p className="muted">{profile.displayName} · Игр: {selected.games} · Голов: {selected.goals}</p>
      <div className="player-short-games">{[...selected.results].reverse().map(game=><article className="player-short-game" data-outcome={game.outcome} key={game.id}>
        <div><h3>Игра {game.sequence}</h3><p>{game.pair.map(team=>teamAppearance(team,selected.colors).name).join(' — ')}</p></div>
        <div className="player-short-result"><strong>{game.score.join(':')}</strong><p>{{win:'Победа',draw:'Ничья',loss:'Поражение'}[game.outcome]}</p></div>
        <span className="player-short-goals">{game.goals?`Голов игрока: ${game.goals}`:'Без забитых голов'}</span>
      </article>)}</div>
    </ActionSheet>}
  </>;
}
