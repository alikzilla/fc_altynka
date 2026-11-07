import { resolveFirstRest, TEAMS, type EventDetailDto, type GameProtocolDto, type GameResult, type GameResultInput } from '@altynka/core';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { ActionSheet } from '../components/ActionSheet';
import { GameTeamName } from '../components/GameTeamName';
import { api, ApiError } from '../lib/api';
import { clearGameDraft, readGameDraft, writeGameDraft, type GameResultDraft } from '../lib/gameDraft';
import { useMe } from '../state/me';
import { gamePlayerName } from '../lib/gamePlayerName';
import { authorAt, changeGoalCount, goalRunsFromInput, inputFromGoalRuns, setGoalAuthor, type GoalRuns } from '../lib/gameGoalRuns';

type Props = { ev: EventDetailDto; protocol: GameProtocolDto; game: GameResult | null; onClose: () => void; onSaved: () => void; reload: () => void };

export function GameResultSheet({ ev, protocol, game, onClose, onSaved, reload }: Props) {
  const me = useMe();
  function fresh(): GameResultDraft {
    return { version:1,gameId:game?.id ?? null,pair:game?.pair ?? protocol.currentPair!,revision:protocol.revision,requestId:crypto.randomUUID(),submitted:false,
      input:{score:game?.score ?? [0,0],scorers:game?.scorers ?? [],...(game?.sequence===1 && protocol.games.length===1 && game.firstRestTeamIndex!==null ? {firstRestTeamIndex:game.firstRestTeamIndex} : {})},
    };
  }
  const [draft,setDraft] = useState<GameResultDraft>(()=>readGameDraft(ev.id,me.userId) ?? fresh());
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [conflict,setConflict] = useState(false);
  const [activeGoal,setActiveGoal] = useState<{side:number;index:number}|null>(null);
  const [visibleGoals,setVisibleGoals] = useState([20,20]);
  const pickerId=useId();
  const picker=useRef<HTMLDivElement>(null);
  const goalButtons=useRef(new Map<string,HTMLButtonElement>());
  const locked = useRef(false);
  const saved = useRef(false);
  useEffect(()=>{if(!saved.current) writeGameDraft(ev.id,me.userId,draft);},[ev.id,me.userId,draft]);
  useEffect(()=>{if(activeGoal) picker.current?.querySelector<HTMLButtonElement>('button')?.focus();},[activeGoal]);
  const targetPair = game?.pair ?? protocol.currentPair;
  const stale = conflict || draft.gameId !== (game?.id ?? null) || draft.revision !== protocol.revision || !targetPair || draft.pair.some((n,i)=>n!==targetPair[i]);
  const editable = !busy && !stale && !draft.submitted;
  const runs=draft.goalRuns ?? goalRunsFromInput(draft.input,draft.pair,protocol.roster);
  const first = game ? game.sequence===1 : protocol.games.length===0;
  const sulifa = protocol.teamCount===3 && first && (!game || protocol.games.length===1) && draft.input.score[0]===draft.input.score[1];
  const totals = draft.pair.map(team=>draft.input.scorers.reduce((sum,g)=>sum+(protocol.roster.find(p=>p.signupId===g.signupId)?.teamIndex===team?g.goals:0),0));
  const valid = draft.input.score.every(n=>Number.isSafeInteger(n)&&n>=0) && totals.every((n,i)=>n<=draft.input.score[i]) && (!sulifa || draft.input.firstRestTeamIndex!==undefined && draft.pair.includes(draft.input.firstRestTeamIndex));

  function change(input: GameResultInput) {
    if (!editable) return;
    setError(null); setDraft(current=>({...current,input}));
  }
  function updateGoals(update:(current:GoalRuns)=>GoalRuns) {
    if(!editable) return;
    setError(null);
    setDraft(current=>{
      const goalRuns=update(current.goalRuns ?? goalRunsFromInput(current.input,current.pair,protocol.roster));
      return {...current,goalRuns,input:inputFromGoalRuns(current.input,goalRuns)};
    });
  }
  function score(side:number,delta:1|-1) {
    updateGoals(current=>changeGoalCount(current,side,delta));setActiveGoal(null);
  }
  function chooseAuthor(side:number,index:number,signupId:number|null) {
    updateGoals(current=>setGoalAuthor(current,side,index,signupId));
    setActiveGoal(null);
    goalButtons.current.get(`${side}:${index}`)?.focus();
  }
  async function save() {
    if (locked.current || !draft.submitted && (stale || !valid)) return;
    locked.current=true; setBusy(true); setError(null);
    const input:GameResultInput = {...draft.input};
    if (!draft.submitted && !sulifa) delete input.firstRestTeamIndex;
    const sent = {...draft,input,submitted:true};
    setDraft(sent); writeGameDraft(ev.id,me.userId,sent);
    try {
      const path=sent.gameId ? `/api/events/${ev.id}/games/results/${encodeURIComponent(sent.gameId)}` : `/api/events/${ev.id}/games/results`;
      await api.send(sent.gameId?'PATCH':'POST',path,{requestId:sent.requestId,expectedRevision:sent.revision,...sent.input});
      saved.current=true; clearGameDraft(ev.id,me.userId); onSaved();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status>=400 && failure.status<500) {
        setDraft(current=>({...current,submitted:false,requestId:crypto.randomUUID()}));
        if (failure.status===409) { setConflict(true); reload(); setError('Данные встречи изменились. Обнови запись перед сохранением.'); }
        else setError(failure.status===403?'Изменять результаты может организатор этой группы.':'Проверь результат, забивших и выбор по сулифа.');
      } else setError('Не удалось подтвердить сохранение. Повтори отправку — игра не продублируется.');
    } finally { locked.current=false; setBusy(false); }
  }

  let nextNames:string|null = null;
  if (game?.sequence===1 && protocol.games.length===1 && protocol.teamCount===3 && valid) {
    const rest=resolveFirstRest(draft.pair,draft.input.score,sulifa?draft.input.firstRestTeamIndex:undefined);
    nextNames=[0,1,2].filter(t=>t!==rest).map(t=>TEAMS[t].name).join(' — ');
  }
  const totalGoals=draft.input.score[0]+draft.input.score[1];
  const assigned=totals[0]+totals[1];
  const footer = <><button className="btn primary wide" disabled={busy || !draft.submitted && (!valid || !!stale)} onClick={save}>{busy?'Сохраняем…':draft.submitted?(stale?'Проверить сохранение':'Повторить сохранение'):'Сохранить результат'}</button><p className="game-result-caption">Автора гола можно указать позже</p></>;
  return <ActionSheet title={game?`Результат игры ${game.sequence}`:'Результат игры'} onClose={onClose} busy={busy} footer={footer} className="game-result-sheet">
    {stale && <div className="game-draft-notice"><p>Данные встречи изменились. Сохранён черновик другой игры: {TEAMS[draft.pair[0]].name} {draft.input.score.join(':')} {TEAMS[draft.pair[1]].name}.</p>{targetPair && <button className="btn wide" disabled={busy} onClick={()=>{setDraft(fresh());setConflict(false);setError(null);}}>Начать новую запись</button>}</div>}
    <fieldset className="game-score-fields" aria-label="Счёт матча" disabled={!editable}>
      {draft.pair.map((team,side)=><Fragment key={team}>{side===1 && <span className="game-score-colon" aria-hidden="true">:</span>}<div className="game-score-side"><GameTeamName index={team}/><div className={`game-score-buttons ${draft.input.score[side]>99?'game-score-long':''}`}><button type="button" aria-label={`Убрать гол команды ${TEAMS[team].name}`} disabled={!editable || !draft.input.score[side]} onClick={()=>score(side,-1)}>−</button><output aria-label={`Голы команды ${TEAMS[team].name}`} aria-live="polite" title={String(draft.input.score[side])}>{draft.input.score[side]}</output><button type="button" aria-label={`Добавить гол команды ${TEAMS[team].name}`} disabled={!editable || draft.input.score[side]===Number.MAX_SAFE_INTEGER} onClick={()=>score(side,1)}>+</button></div></div></Fragment>)}
    </fieldset>
    {draft.input.score.some(n=>n>99) && <p className="game-score-full">Счёт: {draft.input.score.join(':')}</p>}
    {sulifa && <fieldset className="game-sulifa" disabled={!editable}><legend>Кто сел по сулифа?</legend><p className="muted">Ничья остаётся в таблице. Выбери отдыхающую команду.</p><div className="game-sulifa-options">{draft.pair.map(team=><label key={team}><input type="radio" name="sulifa" checked={draft.input.firstRestTeamIndex===team} onChange={()=>change({...draft.input,firstRestTeamIndex:team})}/><GameTeamName index={team}/></label>)}</div></fieldset>}
    <fieldset className="game-scorer-fields" disabled={!editable}>
      <legend><span>Кто забил</span>{totalGoals>0 && <span className="game-goals-total">{assigned} из {totalGoals} указано</span>}</legend>
      <p className="game-goal-help">Добавь гол кнопкой «+», затем выбери автора.</p>
      {totals.some((n,side)=>n>draft.input.score[side]) && <div className="game-draft-notice"><p>В черновике указано больше авторских голов, чем в счёте. Проверь карточки и убери лишние голы.</p><button type="button" className="btn wide" disabled={!editable} onClick={()=>updateGoals(current=>current)}>Убрать лишние авторские голы</button></div>}
      {totalGoals===0 && <p className="game-empty-goals">Пока 0:0<br/>После первого гола здесь появится выбор игрока</p>}
      {draft.pair.map((team,side)=>draft.input.score[side]>0?<section key={team} aria-label={`Авторы голов: ${TEAMS[team].name}`} className="game-scorer-team">
        <h3><GameTeamName index={team}/></h3>
        {Array.from({length:Math.min(draft.input.score[side],visibleGoals[side])},(_,index)=>{
          const signupId=authorAt(runs[side],index);
          const person=protocol.roster.find(p=>p.signupId===signupId && p.teamIndex===team);
          const name=person?gamePlayerName(person,protocol.roster,ev.main):null;
          const expanded=activeGoal?.side===side && activeGoal.index===index;
          return <div key={index}>
            <button type="button" className={`game-goal-slot ${name?'assigned':''} ${expanded?'active':''}`} aria-label={`Гол ${index+1} команды ${TEAMS[team].name}: ${name ?? 'выбрать автора'}`} aria-expanded={expanded} aria-controls={expanded?pickerId:undefined} disabled={!editable} ref={node=>{const key=`${side}:${index}`;if(node)goalButtons.current.set(key,node);else goalButtons.current.delete(key);}} onClick={()=>setActiveGoal(expanded?null:{side,index})}>
              <span className="game-goal-order">{index+1}.</span><span className="game-goal-identity">{name ?? 'Кто забил?'}<small>{name?'Нажми, чтобы изменить':'Выбрать игрока'}</small></span><span aria-hidden="true">{name?'✓':'+'}</span>
            </button>
            {expanded && <div className="game-player-picker" id={pickerId} ref={picker} role="group" aria-label={`Выбрать автора гола команды ${TEAMS[team].name}`} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setActiveGoal(null);goalButtons.current.get(`${side}:${index}`)?.focus();}}}>
              {protocol.roster.filter(p=>p.teamIndex===team).map(player=>{const playerName=gamePlayerName(player,protocol.roster,ev.main);return <button type="button" className="game-player-option" key={player.signupId} aria-label={playerName} aria-pressed={signupId===player.signupId} disabled={!editable} onClick={()=>chooseAuthor(side,index,player.signupId)}><span className="game-player-initial" aria-hidden="true">{player.name[0]}</span><span>{playerName}{player.userId===null && <small className="muted">Гость</small>}</span><span aria-hidden="true">{signupId===player.signupId?'✓':''}</span></button>;})}
              <button type="button" className="game-player-option" aria-pressed={signupId===null} disabled={!editable} onClick={()=>chooseAuthor(side,index,null)}>Оставить без автора<span aria-hidden="true">{signupId===null?'✓':''}</span></button>
            </div>}
          </div>;
        })}
        {draft.input.score[side]>visibleGoals[side] && <button type="button" className="btn-text game-more-goals" disabled={!editable} onClick={()=>setVisibleGoals(current=>current.map((n,i)=>i===side?n+20:n))}>Показать ещё голы</button>}
      </section>:null)}
    </fieldset>
    {nextNames && <p className="muted">После исправления следующая пара: {nextNames}.</p>}
    {game?.sequence===1 && protocol.games.length>1 && <p className="muted">Пары уже сыгранных игр и исходное решение об отдыхе сохранятся.</p>}
    {draft.submitted && !stale && <p className="muted">Проверяем отправленный результат. После подтверждения откроется следующая игра.</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </ActionSheet>;
}
