import { resolveFirstRest, TEAMS, type EventDetailDto, type GameProtocolDto, type GameResult, type GameResultInput } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { ActionSheet } from '../components/ActionSheet';
import { GameTeamName } from '../components/GameTeamName';
import { api, ApiError } from '../lib/api';
import { clearGameDraft, readGameDraft, writeGameDraft, type GameResultDraft } from '../lib/gameDraft';
import { useMe } from '../state/me';

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
  const locked = useRef(false);
  const saved = useRef(false);
  useEffect(()=>{if(!saved.current) writeGameDraft(ev.id,me.userId,draft);},[ev.id,me.userId,draft]);
  const targetPair = game?.pair ?? protocol.currentPair;
  const stale = conflict || draft.gameId !== (game?.id ?? null) || draft.revision !== protocol.revision || !targetPair || draft.pair.some((n,i)=>n!==targetPair[i]);
  const editable = !busy && !stale && !draft.submitted;
  const first = game ? game.sequence===1 : protocol.games.length===0;
  const sulifa = protocol.teamCount===3 && first && (!game || protocol.games.length===1) && draft.input.score[0]===draft.input.score[1];
  const totals = draft.pair.map(team=>draft.input.scorers.reduce((sum,g)=>sum+(protocol.roster.find(p=>p.signupId===g.signupId)?.teamIndex===team?g.goals:0),0));
  const valid = draft.input.score.every(n=>Number.isSafeInteger(n)&&n>=0) && totals.every((n,i)=>n<=draft.input.score[i]) && (!sulifa || draft.input.firstRestTeamIndex!==undefined && draft.pair.includes(draft.input.firstRestTeamIndex));

  function change(input: GameResultInput) {
    if (!editable) return;
    setError(null); setDraft(current=>({...current,input}));
  }
  function score(side: number, value: number) {
    const values: [number,number] = [...draft.input.score]; values[side] = Number.isNaN(value)?0:value;
    change({...draft.input,score:values});
  }
  function goals(signupId: number, value: number) {
    if (!Number.isSafeInteger(value) || value<0) return;
    change({...draft.input,scorers:[...draft.input.scorers.filter(g=>g.signupId!==signupId),...(value?[{signupId,goals:value}]:[])]});
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
  const footer = <button className="btn primary wide" disabled={busy || !draft.submitted && (!valid || !!stale)} onClick={save}>{busy?'Сохраняем…':draft.submitted?(stale?'Проверить сохранение':'Повторить сохранение'):'Сохранить результат'}</button>;
  return <ActionSheet title={game?`Результат игры ${game.sequence}`:'Результат игры'} onClose={onClose} busy={busy} footer={footer} className="game-result-sheet">
    {stale && <div className="game-draft-notice"><p>Данные встречи изменились. Сохранён черновик другой игры: {TEAMS[draft.pair[0]].name} {draft.input.score.join(':')} {TEAMS[draft.pair[1]].name}.</p>{targetPair && <button className="btn wide" disabled={busy} onClick={()=>{setDraft(fresh());setConflict(false);setError(null);}}>Начать новую запись</button>}</div>}
    <fieldset className="game-score-fields" disabled={!editable}>
      {draft.pair.map((team,side)=><label key={team}><GameTeamName index={team}/><input aria-label={`Голы команды ${TEAMS[team].name}`} type="number" inputMode="numeric" min="0" step="1" max={Number.MAX_SAFE_INTEGER} value={draft.input.score[side]} onChange={e=>score(side,e.target.valueAsNumber)}/></label>)}
    </fieldset>
    {sulifa && <fieldset className="game-sulifa" disabled={!editable}><legend>Кто сел по сулифа?</legend><p className="muted">Ничья остаётся в таблице. Выбери отдыхающую команду.</p><div className="game-sulifa-options">{draft.pair.map(team=><label key={team}><input type="radio" name="sulifa" checked={draft.input.firstRestTeamIndex===team} onChange={()=>change({...draft.input,firstRestTeamIndex:team})}/><GameTeamName index={team}/></label>)}</div></fieldset>}
    <fieldset className="game-scorer-fields" disabled={!editable}>
      <legend>Кто забил</legend>
      {draft.pair.map((team,side)=><section key={team} aria-label={`Авторы голов: ${TEAMS[team].name}`} className="game-scorer-team">
        <h3><GameTeamName index={team}/></h3>
        {protocol.roster.filter(p=>p.teamIndex===team).map(person=>{
          const count=draft.input.scorers.find(g=>g.signupId===person.signupId)?.goals ?? 0;
          return <div className="game-scorer-control" key={person.signupId}><span className="game-scorer-identity">{person.name}{person.userId===null && <small className="muted">Гость</small>}</span><div className="game-stepper"><button type="button" aria-label={`Убрать гол: ${person.name}`} disabled={!count} onClick={()=>goals(person.signupId,count-1)}>−</button><input type="number" inputMode="numeric" min="0" max={draft.input.score[side]} aria-label={`Голы: ${person.name}`} value={count} onChange={e=>goals(person.signupId,e.target.valueAsNumber)}/><button type="button" aria-label={`Добавить гол: ${person.name}`} disabled={totals[side]>=draft.input.score[side]} onClick={()=>goals(person.signupId,count+1)}>+</button></div></div>;
        })}
        {totals[side]>draft.input.score[side]?<p className="field-error">Указано больше голов, чем в результате.</p>:draft.input.score[side]>totals[side] && <p className="muted game-unknown">Автор не указан: {draft.input.score[side]-totals[side]}</p>}
      </section>)}
    </fieldset>
    {nextNames && <p className="muted">После исправления следующая пара: {nextNames}.</p>}
    {game?.sequence===1 && protocol.games.length>1 && <p className="muted">Пары уже сыгранных игр и исходное решение об отдыхе сохранятся.</p>}
    {draft.submitted && !stale && <p className="muted">Проверяем отправленный результат. После подтверждения откроется следующая игра.</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </ActionSheet>;
}
