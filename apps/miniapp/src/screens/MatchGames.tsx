import { calculateAssists, plural, teamAppearance, type EventDetailDto, type GameProtocolDto, type GameResult } from '@altynka/core';
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ActionSheet } from '../components/ActionSheet';
import { GameTeamName } from '../components/GameTeamName';
import { MatchAction } from '../components/MatchAction';
import { ConfirmButton, EmptyState } from '../components/ui';
import { Icon } from '../components/Icon';
import { GameResultSheet } from './GameResultSheet';
import { gamePlayerName } from '../lib/gamePlayerName';
import { FinishMatchSheet, useGameProtocolActions } from './gameProtocolActions';

/** One line per run of goals with the same author and pass: «Али ×2 (Дамир)». */
type GoalLine = { author: string; pass: string | null };
function goalLines(protocol: GameProtocolDto, game: GameResult, team: number, ev: EventDetailDto): GoalLine[] {
  const lines:GoalLine[]=[];
  const name=(signupId:number)=>{const person=protocol.roster.find(p=>p.signupId===signupId);return person?gamePlayerName(person,protocol.roster,ev.main):null;};
  const times=(n:number)=>n>1?` ×${n}`:'';
  let known=0;
  for(const g of game.scorers) {
    const person=protocol.roster.find(p=>p.signupId===g.signupId && p.teamIndex===team);
    if(!person) continue;
    const scorer=gamePlayerName(person,protocol.roster,ev.main);
    let left=g.goals;known+=g.goals;
    for(const a of game.assists ?? []) {
      if(a.scorerSignupId!==g.signupId || !left) continue;
      const n=Math.min(left,a.goals);left-=n;
      const passer=name(a.assistSignupId);
      lines.push({author:`${scorer}${times(n)}`,pass:passer});
    }
    if(left) lines.push({author:`${scorer}${times(left)}`,pass:null});
  }
  const missing=game.score[game.pair.indexOf(team)]-known;
  if(missing>0) lines.push({author:`автор не указан: ${missing}`,pass:null});
  return lines;
}

function GameResults({games,protocol,ev,onEdit}:{games:readonly GameResult[];protocol:GameProtocolDto;ev:EventDetailDto;onEdit:(game:GameResult)=>void}) {
  return <ol className="game-results">{games.map(game=>{
    const [a,b]=game.score;
    const tone=(side:0|1)=>a===b?'':(side===0?a>b:b>a)?'game-winner':'game-loser';
    return <li key={game.id} className="game-result">
      <div className="game-result-meta"><span>Игра {game.sequence}</span>{protocol.canEdit && <button className="btn-text" aria-label={`Изменить результат игры ${game.sequence}`} onClick={event=>{event.currentTarget.focus();onEdit(game);}}>Изменить</button>}</div>
      <div className="game-result-pair"><span className={tone(0)}><GameTeamName colors={ev.teams?.colors} index={game.pair[0]}/></span><strong className="game-score-pill">{a}:{b}</strong><span className={tone(1)}><GameTeamName colors={ev.teams?.colors} index={game.pair[1]}/></span></div>
      <div className="game-goal-columns">{game.pair.map(team=>{const lines=goalLines(protocol,game,team,ev);return <ul key={team} aria-label={`Голы: ${teamAppearance(team, ev.teams?.colors).name}`}>{lines.length?lines.map((line,i)=><li key={i}>{line.author}{line.pass && <small> ({line.pass})</small>}</li>):<li className="game-goal-none">—</li>}</ul>;})}</div>
    </li>;
  })}</ol>;
}

/** Match leaders: goals by default, passes on demand; ties share a place. */
function GameLeaders({protocol,ev}:{protocol:GameProtocolDto;ev:EventDetailDto}) {
  const [board,setBoard]=useState<'goals'|'assists'>('goals');
  const assists=useMemo(()=>calculateAssists(protocol.roster,protocol.games),[protocol.roster,protocol.games]);
  const rows=board==='goals'?protocol.scorers.map(p=>({...p,value:p.goals})):assists.map(p=>({...p,value:p.assists}));
  return <section className="card material-graphite game-bombardiers" aria-labelledby="game-scorers-heading">
    <div className="game-leaders-heading"><h2 id="game-scorers-heading">{board==='goals'?'Бомбардиры':'Ассистенты'}</h2>
      <div className="tabs game-leaders-switch" role="group" aria-label="Показатель">{([['goals','Голы'],['assists','Пасы']] as const).map(([key,text])=><button type="button" key={key} className={board===key?'on':''} aria-pressed={board===key} onClick={()=>setBoard(key)}>{text}</button>)}</div>
    </div>
    {rows.length?<ol className="game-scorers-list">{rows.map(p=><li key={p.signupId}><span className={`game-medal ${p.rank===1?'gold':''}`}>{p.rank}</span><span className="game-scorer-identity">{gamePlayerName(p,protocol.roster,ev.main)}<small className={`muted team-${teamAppearance(p.teamIndex, ev.teams?.colors).key}`}><span className="team-dot" aria-hidden="true"/>{teamAppearance(p.teamIndex, ev.teams?.colors).name}{p.userId===null?' · гость':''}</small></span><b>{p.value}</b></li>)}</ol>
      :<p className="muted">{board==='goals'?'Авторы голов пока не указаны.':'Пасы пока не указаны.'}</p>}
  </section>;
}

export function MatchGames({ ev, reload }: { ev: EventDetailDto; reload: () => void }) {
  const protocol=ev.gameProtocol;
  const [result,setResult]=useState<GameResult|null|undefined>(undefined);
  const [menu,setMenu]=useState(false);
  const [history,setHistory]=useState(false);
  const actions=useGameProtocolActions(ev,reload,()=>setMenu(false));
  const {busy,error,pendingFinish}=actions;
  if(!protocol || protocol.state==='legacy') return <EmptyState title="Протокол не велся" text="В этом матче результаты коротких игр не записывались."/>;
  if(protocol.state==='not_started') return <EmptyState title="Матч ещё не начался" text="После подтверждения составов организатор начнёт матч. Здесь появятся пары, результаты и таблица." action={<Link className="btn" href={`/event/${ev.id}?tab=teams`}>К составам</Link>}/>;
  const active=protocol.state==='playing';
  const pointsOf=(team:number)=>protocol.standings.find(t=>t.teamIndex===team)?.points ?? 0;
  const kickoff=protocol.teamCount===2 && !protocol.games.length ? protocol.kickoffTeamIndex ?? null : null;
  // The time itself lives on the game screen; here a blinking mark only says the clock is running right now.
  const live=!!protocol.timer && protocol.timer.pausedAt===null;
  const openMenu=()=>{actions.clearError();setMenu(true);};
  return <div className="match-games">
    {active && protocol.currentPair ? <section className="card material-blue game-current game-current-compact" aria-label="Текущая игра">
      <div className="game-current-top">
        <p className="game-current-meta">Игра {protocol.games.length+1}{live && <span className="game-live" role="img" aria-label="Игра идёт"/>}</p>
        {protocol.restingTeamIndex!==null ? <p className={`game-rest team-${teamAppearance(protocol.restingTeamIndex, ev.teams?.colors).key}`}><span className="team-dot" aria-hidden="true"/>Отдыхают {teamAppearance(protocol.restingTeamIndex, ev.teams?.colors).name}</p>
          : kickoff!==null && <p className={`game-rest team-${teamAppearance(kickoff, ev.teams?.colors).key}`}><span className="team-dot" aria-hidden="true"/>С мячом начинают {teamAppearance(kickoff, ev.teams?.colors).name}</p>}
      </div>
      {/* One line: small kit, name and points on each side, VS between them. */}
      <div className="game-versus">{protocol.currentPair.map((team,i)=><Fragment key={team}>{i===1 && <span className="game-vs" aria-hidden="true">VS</span>}<div className={`game-side team-${teamAppearance(team, ev.teams?.colors).key}`}><span className="game-kit" aria-hidden="true"/><span className="game-side-name"><b>{teamAppearance(team, ev.teams?.colors).name}</b><small>{pointsOf(team)} {plural(pointsOf(team),'очко','очка','очков')}</small></span></div></Fragment>)}</div>
      {!protocol.canRecord && (protocol.canFinish
        ? <div className="match-action-pair"><Link className="btn wide" href={`/event/${ev.id}/game`}>Открыть игру</Link><button className="btn match-action-more" aria-label="Действия" onClick={openMenu}><Icon name="more" /></button></div>
        : <Link className="btn wide" href={`/event/${ev.id}/game`}>Открыть игру</Link>)}
      {protocol.canRecord && <MatchAction><div className="match-action-pair"><Link className="btn primary wide" href={`/event/${ev.id}/game`}>Открыть игру</Link>{protocol.canFinish && <button className="btn match-action-more" aria-label="Действия" onClick={openMenu}><Icon name="more" /></button>}</div></MatchAction>}
    </section> : <div className="game-completed"><h2>Итоги матча</h2><p className="muted">{protocol.games.length?`Сыграно игр: ${protocol.games.length}`:'Результаты не записывались'}</p></div>}
    <section className="card material-graphite game-standings-section" aria-labelledby="game-table-heading"><h2 id="game-table-heading">Таблица</h2><div className="game-table-scroll" role="region" aria-label="Статистика команд" tabIndex={0}><table className="game-standings" aria-label="Таблица команд">
      <thead><tr><th scope="col">Команда</th><th scope="col"><abbr title="Игры">И</abbr></th><th scope="col"><abbr title="Победы, ничьи, поражения">В–Н–П</abbr></th><th scope="col"><abbr title="Забито, пропущено и разница голов">Мячи</abbr></th><th scope="col">Очки</th></tr></thead>
      <tbody>{protocol.standings.map(t=><tr key={t.teamIndex}><th scope="row"><span className="game-rank">{t.rank}</span><GameTeamName colors={ev.teams?.colors} index={t.teamIndex}/></th><td>{t.played}</td><td>{t.wins}–{t.draws}–{t.losses}</td><td>{t.goalsFor}:{t.goalsAgainst}<small> ({t.goalDifference>0?'+':''}{t.goalDifference})</small></td><td className="game-points">{t.points}</td></tr>)}</tbody>
    </table></div><p className="muted game-table-note">Победа — 3 очка, ничья — 1.</p></section>

    <section className="card material-graphite game-history" aria-labelledby="game-history-heading"><div className="game-history-heading"><h2 id="game-history-heading">Последние игры</h2>{protocol.games.length>0 && <button className="btn-text" aria-label={`Все игры (${protocol.games.length})`} onClick={event=>{event.currentTarget.focus();setHistory(true);}}>Все {protocol.games.length} <span aria-hidden="true">→</span></button>}</div>
      {protocol.games.length?<GameResults games={protocol.games.slice(-3).reverse()} protocol={protocol} ev={ev} onEdit={setResult}/>:<p className="muted">После первой игры здесь появятся результат и забившие.</p>}
    </section>

    <GameLeaders protocol={protocol} ev={ev}/>

    {history && <ActionSheet title="Все игры" onClose={()=>setHistory(false)} className="game-history-sheet"><p className="game-history-intro">Сыграно {protocol.games.length} · сначала последние</p><GameResults games={[...protocol.games].reverse()} protocol={protocol} ev={ev} onEdit={setResult}/></ActionSheet>}
    {result!==undefined && <GameResultSheet ev={ev} protocol={protocol} game={result} onClose={()=>setResult(undefined)} onSaved={()=>{setResult(undefined);reload();}} reload={reload}/>}
    {menu && <ActionSheet title="Протокол матча" onClose={()=>setMenu(false)} busy={busy}>
      {protocol.canFinish && <button className="sheet-action" onClick={actions.openFinish}>{pendingFinish?'Проверить завершение':'Завершить матч'}</button>}
      {protocol.canUndo && !pendingFinish && <ConfirmButton className="sheet-action danger-text" label="Отменить последнюю запись" confirmLabel={`Убрать результат игры ${protocol.games.at(-1)?.sequence}?`} disabled={busy} onConfirm={actions.undo}/>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </ActionSheet>}
    {actions.finishing && <FinishMatchSheet protocol={protocol} actions={actions}/>}
  </div>;
}
