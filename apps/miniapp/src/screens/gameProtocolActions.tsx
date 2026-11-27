import type { EventDetailDto, GameProtocolDto } from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { ActionSheet } from '../components/ActionSheet';
import { api, ApiError } from '../lib/api';
import { clearGameFinish, readGameFinish, writeGameFinish, type GameFinishDraft } from '../lib/gameDraft';
import { useMe } from '../state/me';

/**
 * Undo of the last result and finishing the match, shared by the games tab and the game screen.
 * `closeMenu` closes the host's «Протокол матча» sheet after a successful undo, when finishing opens and once
 * the match is completed.
 */
export function useGameProtocolActions(ev: EventDetailDto, reload: () => void, closeMenu: () => void) {
  const me=useMe();
  const protocol=ev.gameProtocol;
  const [finishing,setFinishing]=useState(false);
  const [selected,setSelected]=useState<number[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const locked=useRef(false);
  const [pendingFinish,setPendingFinish]=useState<GameFinishDraft|null>(()=>readGameFinish(ev.id,me.userId));
  const finishRequest=useRef<GameFinishDraft|null>(pendingFinish);
  const undoRequest=useRef<{requestId:string;expectedRevision:number}|null>(null);
  const close=useRef(closeMenu);
  close.current=closeMenu;
  useEffect(()=>{
    if(protocol?.state==='completed'){
      clearGameFinish(ev.id,me.userId);finishRequest.current=null;setPendingFinish(null);setFinishing(false);close.current();setError(null);
    }
  },[protocol?.state,ev.id,me.userId]);
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
    try {await api.send('POST',`/api/events/${ev.id}/games/undo`,undoRequest.current);undoRequest.current=null;close.current();reload();}
    catch(failure){setError('Не получилось отменить запись. Повтори отправку.');if(failure instanceof ApiError && failure.status<500){undoRequest.current=null;reload();}}
    finally{locked.current=false;setBusy(false);}
  }
  function openFinish(){
    setError(null);close.current();
    const appeared=new Set(protocol!.games.flatMap(g=>[...g.pair]));
    setSelected(finishRequest.current?.participantSignupIds ?? protocol!.roster.filter(p=>!protocol!.games.length || appeared.has(p.teamIndex)).map(p=>p.signupId));setFinishing(true);
  }
  return {
    busy, error, pendingFinish, finishing, selected,
    clearError:()=>setError(null), setSelected, closeFinish:()=>setFinishing(false), finish, undo, openFinish,
  };
}

export type GameProtocolActions = ReturnType<typeof useGameProtocolActions>;

/** «Завершить матч»: who played gets the survey; the command survives closing and an ambiguous answer. */
export function FinishMatchSheet({ protocol, actions }: { protocol: GameProtocolDto; actions: GameProtocolActions }) {
  const { busy, pendingFinish, selected, setSelected, error } = actions;
  return <ActionSheet title="Завершить матч" onClose={actions.closeFinish} busy={busy} footer={<button className="btn primary wide" disabled={busy || protocol.games.length>0 && !selected.length} onClick={actions.finish}>{busy?'Завершаем…':pendingFinish?'Повторить завершение':'Подтвердить завершение'}</button>}>
    <p className="muted">Отметь тех, кто играл. Им откроется опрос. Составы и оплата сохранятся.</p>
    <fieldset className="form-fields finish-roster" disabled={busy || pendingFinish!==null}>{protocol.roster.map(person=><label className="finish-person" key={person.signupId}><input type="checkbox" checked={selected.includes(person.signupId)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,person.signupId]:ids.filter(id=>id!==person.signupId))}/><span>{person.name}{person.userId===null && <small className="muted"> · гость</small>}</span></label>)}</fieldset>
    {!protocol.games.length && <p className="muted">Если никто не играл, убери все отметки — матч завершится без опроса.</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </ActionSheet>;
}
