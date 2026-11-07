import { TEAMS, type EventDetailDto, type GameProtocolDto, type GameResult } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ActionSheet } from '../components/ActionSheet';
import { GameTeamName } from '../components/GameTeamName';
import { MatchAction } from '../components/MatchAction';
import { ConfirmButton, EmptyState } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { GameResultSheet } from './GameResultSheet';
import { gamePlayerName } from '../lib/gamePlayerName';
import { clearGameFinish, readGameFinish, writeGameFinish, type GameFinishDraft } from '../lib/gameDraft';
import { useMe } from '../state/me';

function goalsText(protocol: GameProtocolDto, game: GameResult, team: number, ev: EventDetailDto): string {
  const entries=game.scorers.flatMap(g=>{
    const person=protocol.roster.find(p=>p.signupId===g.signupId && p.teamIndex===team);
    return person?[`${gamePlayerName(person,protocol.roster,ev.main)}${g.goals>1?` ×${g.goals}`:''}`]:[];
  });
  const known=game.scorers.reduce((sum,g)=>sum+(protocol.roster.find(p=>p.signupId===g.signupId)?.teamIndex===team?g.goals:0),0);
  const missing=game.score[game.pair.indexOf(team)]-known;
  if(missing>0) entries.push(`автор не указан: ${missing}`);
  return entries.join(', ');
}

function GameResults({games,protocol,ev,onEdit}:{games:readonly GameResult[];protocol:GameProtocolDto;ev:EventDetailDto;onEdit:(game:GameResult)=>void}) {
  return <ol className="game-results">{games.map(game=><li key={game.id} className="game-result">
    <div className="row between"><span className="muted">Игра {game.sequence}</span>{protocol.canEdit && <button className="btn-text" aria-label={`Изменить результат игры ${game.sequence}`} onClick={event=>{event.currentTarget.focus();onEdit(game);}}>Изменить</button>}</div>
    <div className="game-result-pair"><GameTeamName index={game.pair[0]}/><strong>{game.score[0]}:{game.score[1]}</strong><GameTeamName index={game.pair[1]}/></div>
    {game.pair.map(team=>{const text=goalsText(protocol,game,team,ev);return text?<p className="game-goals" key={team}><span>{TEAMS[team].name}:</span> {text}</p>:null;})}
  </li>)}</ol>;
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
  if(!protocol || protocol.state==='legacy') return <EmptyState title="Протокол не велся" text="Для этой встречи результаты коротких игр не записывались."/>;
  if(protocol.state==='not_started') return <EmptyState title="Встреча ещё не началась" text="После подтверждения составов организатор начнёт встречу. Здесь появятся пары, результаты и таблица." action={<Link className="btn" href={`/event/${ev.id}?tab=teams`}>К составам</Link>}/>;
  const active=protocol.state==='playing';
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
      setError(failure instanceof ApiError && failure.status===409?'Данные встречи изменились. Проверь участников и повтори завершение.':'Не удалось подтвердить завершение. Повтори отправку с теми же участниками.');
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
      <div className="row between"><p className="game-current-meta">Игра {protocol.games.length+1} · 6 минут</p>{protocol.canFinish && <button className="btn-text" onClick={()=>{setError(null);setMenu(true);}}>Действия</button>}</div>
      <div className="game-pair"><GameTeamName index={protocol.currentPair[0]}/><span className="game-pair-separator">—</span><GameTeamName index={protocol.currentPair[1]}/></div>
      {protocol.restingTeamIndex!==null && <p className="game-rest">Отдыхают: {TEAMS[protocol.restingTeamIndex].name}</p>}
      {protocol.canRecord && <MatchAction><button className="btn primary wide" onClick={event=>{event.currentTarget.focus();setResult(null);}}>Внести результат</button></MatchAction>}
    </section> : <div className="game-completed"><h2>Итоги встречи</h2><p className="muted">{protocol.games.length?`Сыграно игр: ${protocol.games.length}`:'Результаты не записывались'}</p></div>}

    <section className="card game-standings-section" aria-labelledby="game-table-heading"><h2 id="game-table-heading">Таблица</h2><div className="game-table-scroll" role="region" aria-label="Статистика команд" tabIndex={0}><table className="game-standings" aria-label="Таблица команд">
      <thead><tr><th scope="col">Команда</th><th scope="col"><abbr title="Игры">И</abbr></th><th scope="col"><abbr title="Победы, ничьи, поражения">В–Н–П</abbr></th><th scope="col"><abbr title="Забито, пропущено и разница голов">Мячи</abbr></th><th scope="col">Очки</th></tr></thead>
      <tbody>{protocol.standings.map(t=><tr key={t.teamIndex}><th scope="row"><span className="game-rank">{t.rank}</span><GameTeamName index={t.teamIndex}/></th><td>{t.played}</td><td>{t.wins}–{t.draws}–{t.losses}</td><td>{t.goalsFor}:{t.goalsAgainst}<small> ({t.goalDifference>0?'+':''}{t.goalDifference})</small></td><td className="game-points">{t.points}</td></tr>)}</tbody>
    </table></div><p className="muted game-table-note">Победа — 3 очка, ничья — 1.</p></section>

    <section className="game-history" aria-labelledby="game-history-heading"><div className="game-history-heading"><h2 id="game-history-heading">Последние матчи</h2>{protocol.games.length>0 && <button className="btn-text" aria-label={`Все матчи (${protocol.games.length})`} onClick={event=>{event.currentTarget.focus();setHistory(true);}}>Все матчи ({protocol.games.length}) <span aria-hidden="true">→</span></button>}</div>
      {protocol.games.length?<GameResults games={protocol.games.slice(-3).reverse()} protocol={protocol} ev={ev} onEdit={setResult}/>:<p className="muted">После первой игры здесь появятся результат и забившие.</p>}
    </section>

    <section className="game-bombardiers" aria-labelledby="game-scorers-heading"><h2 id="game-scorers-heading">Бомбардиры</h2>{protocol.scorers.length?<ol className="game-scorers-list">{protocol.scorers.map(p=><li key={p.signupId}><span className="game-rank">{p.rank}</span><span className="game-scorer-identity">{gamePlayerName(p,protocol.roster,ev.main)}<small className="muted">{TEAMS[p.teamIndex].name}{p.userId===null?' · гость':''}</small></span><b>{p.goals}</b></li>)}</ol>:<p className="muted">Авторы голов пока не указаны.</p>}</section>

    {history && <ActionSheet title="Все матчи" onClose={()=>setHistory(false)} className="game-history-sheet"><p className="game-history-intro">Сыграно {protocol.games.length} · сначала последние</p><GameResults games={[...protocol.games].reverse()} protocol={protocol} ev={ev} onEdit={setResult}/></ActionSheet>}
    {result!==undefined && <GameResultSheet ev={ev} protocol={protocol} game={result} onClose={()=>setResult(undefined)} onSaved={()=>{setResult(undefined);reload();}} reload={reload}/>}
    {menu && <ActionSheet title="Действия встречи" onClose={()=>setMenu(false)} busy={busy}>
      {protocol.canFinish && <button className="sheet-action" onClick={openFinish}>{pendingFinish?'Проверить завершение':'Завершить встречу'}</button>}
      {protocol.canUndo && !pendingFinish && <ConfirmButton className="sheet-action danger-text" label="Отменить последнюю запись" confirmLabel={`Убрать результат игры ${protocol.games.at(-1)?.sequence}?`} disabled={busy} onConfirm={undo}/>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </ActionSheet>}
    {finishing && <ActionSheet title="Завершить встречу" onClose={()=>setFinishing(false)} busy={busy} footer={<button className="btn primary wide" disabled={busy || protocol.games.length>0 && !selected.length} onClick={finish}>{busy?'Завершаем…':pendingFinish?'Повторить завершение':'Подтвердить завершение'}</button>}>
      <p className="muted">Отметь тех, кто играл. Им откроется опрос. Составы и оплата сохранятся.</p>
      <fieldset className="form-fields finish-roster" disabled={busy || pendingFinish!==null}>{protocol.roster.map(person=><label className="finish-person" key={person.signupId}><input type="checkbox" checked={selected.includes(person.signupId)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,person.signupId]:ids.filter(id=>id!==person.signupId))}/><span>{person.name}{person.userId===null && <small className="muted"> · гость</small>}</span></label>)}</fieldset>
      {!protocol.games.length && <p className="muted">Если никто не играл, убери все отметки — встреча завершится без опроса.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </ActionSheet>}
  </div>;
}
