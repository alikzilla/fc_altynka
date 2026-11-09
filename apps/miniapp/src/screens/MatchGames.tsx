import { plural, teamAppearance, type EventDetailDto, type GameProtocolDto, type GameResult } from '@altynka/core';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ActionSheet } from '../components/ActionSheet';
import { GameTeamName } from '../components/GameTeamName';
import { MatchAction } from '../components/MatchAction';
import { ConfirmButton, EmptyState } from '../components/ui';
import { Icon } from '../components/Icon';
import { api, ApiError } from '../lib/api';
import { GameResultSheet } from './GameResultSheet';
import { gamePlayerName } from '../lib/gamePlayerName';
import { clearGameFinish, readGameFinish, writeGameFinish, type GameFinishDraft } from '../lib/gameDraft';
import { useMe } from '../state/me';

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

export function MatchGames({ ev, reload }: { ev: EventDetailDto; reload: () => void }) {
  const me=useMe();
  const protocol=ev.gameProtocol;
  const [result,setResult]=useState<GameResult|null|undefined>(undefined);
  const [menu,setMenu]=useState(false);
  const [history,setHistory]=useState(false);
  const [finishing,setFinishing]=useState(false);
  const [selected,setSelected]=useState<number[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const locked=useRef(false);
  const [pendingFinish,setPendingFinish]=useState<GameFinishDraft|null>(()=>readGameFinish(ev.id,me.userId));
  const finishRequest=useRef<GameFinishDraft|null>(pendingFinish);
  const undoRequest=useRef<{requestId:string;expectedRevision:number}|null>(null);
  useEffect(()=>{
    if(protocol?.state==='completed'){
      clearGameFinish(ev.id,me.userId);finishRequest.current=null;setPendingFinish(null);setFinishing(false);setMenu(false);setError(null);
    }
  },[protocol?.state,ev.id,me.userId]);
  if(!protocol || protocol.state==='legacy') return <EmptyState title="Протокол не велся" text="В этом матче результаты коротких игр не записывались."/>;
  if(protocol.state==='not_started') return <EmptyState title="Матч ещё не начался" text="После подтверждения составов организатор начнёт матч. Здесь появятся пары, результаты и таблица." action={<Link className="btn" href={`/event/${ev.id}?tab=teams`}>К составам</Link>}/>;
  const active=protocol.state==='playing';
  const pointsOf=(team:number)=>protocol.standings.find(t=>t.teamIndex===team)?.points ?? 0;
  const kickoff=protocol.teamCount===2 && !protocol.games.length ? protocol.kickoffTeamIndex ?? null : null;
  async function finish() {
    if(locked.current) return;
    locked.current=true; setBusy(true); setError(null);
    finishRequest.current ??= {version:1,requestId:crypto.randomUUID(),expectedRevision:protocol!.revision,participantSignupIds:[...selected]};
    const command=finishRequest.current;setPendingFinish(command);writeGameFinish(ev.id,me.userId,command);
    try {
      const {version:_version,...body}=command;
      await api.send('POST',`/api/events/${ev.id}/games/finish`,body);
      finishRequest.current=null;setPendingFinish(null);clearGameFinish(ev.id,me.userId);setFinishing(false);reload();
    } catch(failure) {
      setError(failure instanceof ApiError && failure.status===409?'Данные матча изменились. Проверь участников и повтори завершение.':'Не удалось подтвердить завершение. Повтори отправку с теми же участниками.');
      if(failure instanceof ApiError && failure.status>=400 && failure.status<500){finishRequest.current=null;setPendingFinish(null);clearGameFinish(ev.id,me.userId);reload();}
    } finally {locked.current=false;setBusy(false);}
  }
  async function undo() {
    if(locked.current) return;
    locked.current=true;setBusy(true);setError(null);
    undoRequest.current ??= {requestId:crypto.randomUUID(),expectedRevision:protocol!.revision};
    try {await api.send('POST',`/api/events/${ev.id}/games/undo`,undoRequest.current);undoRequest.current=null;setMenu(false);reload();}
    catch(failure){setError('Не получилось отменить запись. Повтори отправку.');if(failure instanceof ApiError && failure.status<500){undoRequest.current=null;reload();}}
    finally{locked.current=false;setBusy(false);}
  }
  function openFinish(){
    setError(null);setMenu(false);
    const appeared=new Set(protocol!.games.flatMap(g=>[...g.pair]));
    setSelected(finishRequest.current?.participantSignupIds ?? protocol!.roster.filter(p=>!protocol!.games.length || appeared.has(p.teamIndex)).map(p=>p.signupId));setFinishing(true);
  }
  return <div className="match-games">
    {active && protocol.currentPair ? <section className="card material-blue game-current" aria-label="Текущая игра">
      <div className="row between"><p className="game-current-meta">Игра {protocol.games.length+1}</p>{protocol.canFinish && !protocol.canRecord && <button className="btn-text" onClick={()=>{setError(null);setMenu(true);}}>Действия</button>}</div>
      <div className="game-versus">{protocol.currentPair.map((team,i)=><Fragment key={team}>{i===1 && <span className="game-vs" aria-hidden="true">VS</span>}<div className={`game-side team-${teamAppearance(team, ev.teams?.colors).key}`}><span className="game-kit" aria-hidden="true"/><b>{teamAppearance(team, ev.teams?.colors).name}</b><small>{pointsOf(team)} {plural(pointsOf(team),'очко','очка','очков')}</small></div></Fragment>)}</div>
      {protocol.restingTeamIndex!==null ? <p className={`game-rest team-${teamAppearance(protocol.restingTeamIndex, ev.teams?.colors).key}`}><span className="team-dot" aria-hidden="true"/>Отдыхают {teamAppearance(protocol.restingTeamIndex, ev.teams?.colors).name}</p>
        : kickoff!==null && <p className={`game-rest team-${teamAppearance(kickoff, ev.teams?.colors).key}`}><span className="team-dot" aria-hidden="true"/>С мячом начинают {teamAppearance(kickoff, ev.teams?.colors).name}</p>}
      {protocol.canRecord && <MatchAction><div className="match-action-pair"><button className="btn primary wide" onClick={event=>{event.currentTarget.focus();setResult(null);}}>Внести результат</button>{protocol.canFinish && <button className="btn match-action-more" aria-label="Действия" onClick={()=>{setError(null);setMenu(true);}}><Icon name="more" /></button>}</div></MatchAction>}
    </section> : <div className="game-completed"><h2>Итоги матча</h2><p className="muted">{protocol.games.length?`Сыграно игр: ${protocol.games.length}`:'Результаты не записывались'}</p></div>}
    <section className="card material-graphite game-standings-section" aria-labelledby="game-table-heading"><h2 id="game-table-heading">Таблица</h2><div className="game-table-scroll" role="region" aria-label="Статистика команд" tabIndex={0}><table className="game-standings" aria-label="Таблица команд">
      <thead><tr><th scope="col">Команда</th><th scope="col"><abbr title="Игры">И</abbr></th><th scope="col"><abbr title="Победы, ничьи, поражения">В–Н–П</abbr></th><th scope="col"><abbr title="Забито, пропущено и разница голов">Мячи</abbr></th><th scope="col">Очки</th></tr></thead>
      <tbody>{protocol.standings.map(t=><tr key={t.teamIndex}><th scope="row"><span className="game-rank">{t.rank}</span><GameTeamName colors={ev.teams?.colors} index={t.teamIndex}/></th><td>{t.played}</td><td>{t.wins}–{t.draws}–{t.losses}</td><td>{t.goalsFor}:{t.goalsAgainst}<small> ({t.goalDifference>0?'+':''}{t.goalDifference})</small></td><td className="game-points">{t.points}</td></tr>)}</tbody>
    </table></div><p className="muted game-table-note">Победа — 3 очка, ничья — 1.</p></section>

    <section className="card material-graphite game-history" aria-labelledby="game-history-heading"><div className="game-history-heading"><h2 id="game-history-heading">Последние игры</h2>{protocol.games.length>0 && <button className="btn-text" aria-label={`Все игры (${protocol.games.length})`} onClick={event=>{event.currentTarget.focus();setHistory(true);}}>Все {protocol.games.length} <span aria-hidden="true">→</span></button>}</div>
      {protocol.games.length?<GameResults games={protocol.games.slice(-3).reverse()} protocol={protocol} ev={ev} onEdit={setResult}/>:<p className="muted">После первой игры здесь появятся результат и забившие.</p>}
    </section>

    <section className="card material-graphite game-bombardiers" aria-labelledby="game-scorers-heading"><h2 id="game-scorers-heading">Бомбардиры</h2>{protocol.scorers.length?<ol className="game-scorers-list">{protocol.scorers.map(p=><li key={p.signupId}><span className={`game-medal ${p.rank===1?'gold':''}`}>{p.rank}</span><span className="game-scorer-identity">{gamePlayerName(p,protocol.roster,ev.main)}<small className={`muted team-${teamAppearance(p.teamIndex, ev.teams?.colors).key}`}><span className="team-dot" aria-hidden="true"/>{teamAppearance(p.teamIndex, ev.teams?.colors).name}{p.userId===null?' · гость':''}</small></span><b>{p.goals}</b></li>)}</ol>:<p className="muted">Авторы голов пока не указаны.</p>}</section>

    {history && <ActionSheet title="Все игры" onClose={()=>setHistory(false)} className="game-history-sheet"><p className="game-history-intro">Сыграно {protocol.games.length} · сначала последние</p><GameResults games={[...protocol.games].reverse()} protocol={protocol} ev={ev} onEdit={setResult}/></ActionSheet>}
    {result!==undefined && <GameResultSheet ev={ev} protocol={protocol} game={result} onClose={()=>setResult(undefined)} onSaved={()=>{setResult(undefined);reload();}} reload={reload}/>}
    {menu && <ActionSheet title="Протокол матча" onClose={()=>setMenu(false)} busy={busy}>
      {protocol.canFinish && <button className="sheet-action" onClick={openFinish}>{pendingFinish?'Проверить завершение':'Завершить матч'}</button>}
      {protocol.canUndo && !pendingFinish && <ConfirmButton className="sheet-action danger-text" label="Отменить последнюю запись" confirmLabel={`Убрать результат игры ${protocol.games.at(-1)?.sequence}?`} disabled={busy} onConfirm={undo}/>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </ActionSheet>}
    {finishing && <ActionSheet title="Завершить матч" onClose={()=>setFinishing(false)} busy={busy} footer={<button className="btn primary wide" disabled={busy || protocol.games.length>0 && !selected.length} onClick={finish}>{busy?'Завершаем…':pendingFinish?'Повторить завершение':'Подтвердить завершение'}</button>}>
      <p className="muted">Отметь тех, кто играл. Им откроется опрос. Составы и оплата сохранятся.</p>
      <fieldset className="form-fields finish-roster" disabled={busy || pendingFinish!==null}>{protocol.roster.map(person=><label className="finish-person" key={person.signupId}><input type="checkbox" checked={selected.includes(person.signupId)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,person.signupId]:ids.filter(id=>id!==person.signupId))}/><span>{person.name}{person.userId===null && <small className="muted"> · гость</small>}</span></label>)}</fieldset>
      {!protocol.games.length && <p className="muted">Если никто не играл, убери все отметки — матч завершится без опроса.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </ActionSheet>}
  </div>;
}
