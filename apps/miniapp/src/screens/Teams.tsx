import { alternativeSplit, balanceTeams, formatRating, plural, teamAppearance, teamColorsFor, teamCountFor, type EventDetailDto, type SignupDto, type TeamColor, type TeamCount } from '@altynka/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { api, ApiError } from '../lib/api';
import { isOpen } from '../lib/labels';
import { canManageEvent, useMe } from '../state/me';
import { haptic } from '../lib/tg';
import { EmptyState, useToast } from '../components/ui';
import { MatchAction } from '../components/MatchAction';
import { PlayerProfileSheet } from './PlayerProfile';
import { ActionSheet } from '../components/ActionSheet';
import { TeamColorSheet } from '../components/TeamColorSheet';
import { Icon } from '../components/Icon';

type Props = { ev: EventDetailDto; reload: () => void; actionBlocked?: boolean };
type Draft = { count: TeamCount; split: number[][]; colors: TeamColor[]; ratings: Record<number, number>; fresh: boolean };
type ColorSelection = { colors: TeamColor[]; revision: number };
const copy = (d: Draft): Draft => ({ ...d, split: d.split.map(ids => [...ids]), colors: [...d.colors], ratings: { ...d.ratings } });
const keyOf = (d: Draft) => JSON.stringify(d);
const rosterKeyOf = (d: Draft) => JSON.stringify({ count:d.count, split:d.split.map(ids => [...ids].sort((a,b) => a-b)), ratings:d.ratings });
function fromEvent(ev: EventDetailDto): Draft {
  const count = ev.teams?.teamCount ?? teamCountFor(ev.main.length);
  return { count, split: ev.teams && !ev.teams.stale ? ev.teams.teams.map(ids => [...ids]) : [], colors: teamColorsFor(count, ev.teams?.colors), ratings: Object.fromEntries(ev.main.map(s => [s.id, ev.teams?.ratingSnapshot?.[s.id] ?? s.level ?? 5])), fresh: false };
}

function TeamBlock({ index, colors, ids, byId, average, onColor, children }: { index: number; colors: TeamColor[]; ids: number[]; byId: Map<number, SignupDto>; average?: number; onColor?: () => void; children: (s: SignupDto) => ReactNode }) {
  const t = teamAppearance(index, colors);
  return <section className={`card team team-editor-card team-${t.key}`} role="group" aria-label={t.name}>
    <header className="team-editor-heading"><div><h2><span className="team-dot" aria-hidden="true" />{t.name}</h2><p className="team-editor-meta">{ids.length} {plural(ids.length, 'игрок', 'игрока', 'игроков')}{average !== undefined ? ` · средний рейтинг ${formatRating(average)}` : ''}</p></div>{onColor && <button className="team-color-trigger" type="button" aria-label={`Изменить цвет: ${t.name}`} onClick={onColor}><Icon name="shirt" /></button>}</header>
    <ul className="team-editor-players">{ids.map(id => { const s = byId.get(id); return s ? <li className="team-editor-player" key={id}>{children(s)}</li> : null; })}</ul>
  </section>;
}

function PublishedTeams({ ev, reload }: Props) {
  const me = useMe();
  const toast = useToast();
  const [profileId, setProfileId] = useState<number | null>(null);
  const [colorSheet, setColorSheet] = useState<ColorSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState<TeamColor[] | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => setOverride(null), [ev.teams?.colorsRevision]);
  const frozen = new Map(ev.gameProtocol?.roster.map(p => [p.signupId, p.name]) ?? []);
  const byId = new Map(ev.main.map(s => [s.id, { ...s, name: frozen.get(s.id) ?? s.name }]));
  const colors = override ?? teamColorsFor(ev.teams?.teamCount ?? 2, ev.teams?.colors);
  const ownSignup = ev.main.find(s => s.userId === me.userId);
  const ownTeam = ownSignup ? ev.teams?.teams.findIndex(ids => ids.includes(ownSignup.id)) : -1;
  const canColor = canManageEvent(ev) && ev.gameProtocol?.state === 'playing' && ev.status !== 'cancelled';
  useEffect(() => { if (!canColor) setColorSheet(null); }, [canColor]);
  async function saveColors(next: TeamColor[]) {
    if (locked.current || !canColor) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      await api.send('PATCH', `/api/events/${ev.id}/teams/colors`, { colors: next, expectedRevision: colorSheet?.revision ?? ev.teams?.colorsRevision ?? 0 });
      if (!mounted.current) return;
      setOverride(next); setColorSheet(null); toast('Цвета команд обновлены'); haptic('success'); reload();
    } catch (failure) {
      if (!mounted.current) return;
      setError(failure instanceof ApiError && failure.status === 409 ? 'Данные матча изменились. Закрой шторку, проверь цвета и попробуй ещё раз.' : 'Не получилось сохранить цвета. Попробуй ещё раз.');
      if (failure instanceof ApiError && failure.status === 409) reload();
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  if (!ev.teams?.publishedAt) return <EmptyState title="Составы ещё не опубликованы" text="Организатор добавит команды перед игрой." />;
  return <div className="team-editor">
    <div className="team-editor-title"><h2 className="sr-only">Составы</h2><span className="muted">{ev.gameProtocol?.state === 'playing' ? 'Матч идёт' : 'Опубликованы'}</span></div>
    {ownTeam !== undefined && ownTeam >= 0 && <div className={`team-own-card team-${teamAppearance(ownTeam, colors).key}`}><p className="team-own"><span className="team-dot" aria-hidden="true" />Твоя команда — {teamAppearance(ownTeam, colors).name.toLocaleLowerCase('ru')}</p><p className="muted">Ориентируйся на этот цвет формы или манишек.</p></div>}
    {canColor && <div className="team-live-colors"><button className="btn-text team-text-action" disabled={busy} onClick={() => { setError(null); setColorSheet({colors:[...colors],revision:ev.teams?.colorsRevision ?? 0}); }}><Icon name="shirt" />Цвета команд</button><p className="muted">Составы зафиксированы. Цвета можно исправить под манишки.</p></div>}
    {ev.teams.stale && <p className="card warn-note">Участники изменились. Организатор обновит составы перед игрой.</p>}
    {ev.teams.teams.map((ids, i) => <TeamBlock key={i} index={i} colors={colors} ids={ids} byId={byId}>{s => <div className={`team-player-identity ${s.userId === me.userId ? 'team-self' : ''}`}>{s.userId !== null ? <button className="btn-plain player-profile-link" onClick={() => setProfileId(s.userId)}>{s.name}</button> : s.name}{s.userId === me.userId && <span className="you">ты</span>}</div>}</TeamBlock>)}
    {profileId !== null && <PlayerProfileSheet userId={profileId} onClose={() => setProfileId(null)} />}
    {colorSheet && <TeamColorSheet colors={colorSheet.colors} players={ev.teams.teams.map(ids => ids.map(id => byId.get(id)?.name ?? 'Игрок'))} busy={busy} error={error} onClose={() => setColorSheet(null)} onApply={saveColors} />}
  </div>;
}

function TeamEditor({ ev, reload, actionBlocked }: Props) {
  const toast = useToast();
  const me = useMe();
  const [, navigate] = useLocation();
  const byId = useMemo(() => new Map(ev.main.map(s => [s.id, s])), [ev.main]);
  const [draft, setDraft] = useState<Draft>(() => fromEvent(ev));
  const [savedKey, setSavedKey] = useState(() => keyOf(fromEvent(ev)));
  const remoteKey = JSON.stringify(ev.teams);
  const [acceptedRemote, setAcceptedRemote] = useState(remoteKey);
  const history = useRef<Draft[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [colorSheet, setColorSheet] = useState<ColorSelection | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const [regenerate, setRegenerate] = useState<TeamCount | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const colorsRevision = useRef(ev.teams?.colorsRevision ?? 0);
  const storedColors = useRef(teamColorsFor(draft.count, ev.teams?.colors));
  const ownWrite = useRef<{roster:string; colorsRevision:number} | null>(null);
  const pendingColorWrite = useRef<ColorSelection | null>(null);
  const startRequest = useRef<{ requestId: string; expectedRevision: number } | null>(null);
  const changed = keyOf(draft) !== savedKey;
  const remoteMatchesDraft = ev.teams?.teamCount === draft.count
    && ev.teams.teams.every((ids, index) => [...ids].sort((a,b) => a-b).join(',') === [...(draft.split[index] ?? [])].sort((a,b) => a-b).join(','))
    && JSON.stringify(teamColorsFor(draft.count, ev.teams.colors)) === JSON.stringify(draft.colors)
    && (!ev.teams.ratingSnapshot || ev.main.every(s => ev.teams!.ratingSnapshot![s.id] === draft.ratings[s.id]));
  const remoteIsOwnWrite = ownWrite.current && ev.teams && rosterKeyOf(fromEvent(ev)) === ownWrite.current.roster && (ev.teams.colorsRevision ?? 0) === ownWrite.current.colorsRevision;
  const serverChanged = changed && remoteKey !== acceptedRemote && !remoteMatchesDraft && !remoteIsOwnWrite;
  const canStart = ev.protocolVersion === 1 && !!ev.gameProtocol?.canStart && !!ev.teams?.publishedAt && !ev.teams.stale && !changed && !publishError;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const pending = pendingColorWrite.current;
    if (!busy && pending && ev.teams?.colorsRevision === pending.revision + 1 && ev.teams.teamCount === pending.colors.length && JSON.stringify(ev.teams.colors) === JSON.stringify(pending.colors)) {
      colorsRevision.current = ev.teams.colorsRevision; storedColors.current = [...pending.colors]; pendingColorWrite.current = null;
      if (ownWrite.current && rosterKeyOf(fromEvent(ev)) === ownWrite.current.roster) ownWrite.current.colorsRevision = colorsRevision.current;
      setAcceptedRemote(remoteKey); return;
    }
    if (remoteKey === acceptedRemote || changed || busy || ownWrite.current || pendingColorWrite.current) return;
    const next = fromEvent(ev);
    setDraft(next); setSavedKey(keyOf(next)); setAcceptedRemote(remoteKey); history.current = [];
    colorsRevision.current = ev.teams?.colorsRevision ?? 0; storedColors.current = next.colors;
  }, [remoteKey, acceptedRemote, changed, busy, ev]);

  function undo() {
    if (!mounted.current || locked.current) return;
    const previous = history.current.pop();
    if (!previous) return;
    setDraft(previous); setPublishError(null); toast('Последнее изменение отменено'); haptic('light');
  }
  function edit(next: Draft, message: string) {
    if (locked.current) return;
    history.current.push(copy(draft));
    if (history.current.length > 30) history.current.shift();
    setDraft(next); setPublishError(null); haptic('light');
    toast(message, { action: { label: 'Отменить', onClick: undo } });
  }
  function divide(count: TeamCount, alternative = false) {
    const ratings = Object.fromEntries(ev.main.map(s => [s.id, s.userId === null ? draft.ratings[s.id] ?? s.level ?? 5 : s.level ?? 5]));
    const players = ev.main.map(s => ({ id: s.id, level: ratings[s.id] }));
    const split = alternative && count === draft.count ? alternativeSplit(players, count, draft.split) : balanceTeams(players, count);
    edit({ count, split, colors: teamColorsFor(count, draft.colors), ratings, fresh: true }, 'Новый вариант готов');
    setRegenerate(null);
  }
  function swap(id: number) {
    if (selected === null || locked.current) return;
    const from = draft.split.findIndex(ids => ids.includes(selected));
    const to = draft.split.findIndex(ids => ids.includes(id));
    if (from < 0 || to < 0 || from === to) return;
    const split = draft.split.map(ids => ids.map(value => value === selected ? id : value === id ? selected : value));
    edit({ ...draft, split }, `${byId.get(selected)?.name} и ${byId.get(id)?.name} поменялись командами`);
    setSelected(null);
  }
  function resetToServer() {
    const next = fromEvent(ev); history.current = []; setDraft(next); setSavedKey(keyOf(next)); setAcceptedRemote(remoteKey);
    colorsRevision.current = ev.teams?.colorsRevision ?? 0; storedColors.current = next.colors; ownWrite.current = null; pendingColorWrite.current = null; setPublishError(null); toast(null);
  }
  function openColors() {
    toast(null); setColorError(null); setColorSheet({colors:[...draft.colors],revision:colorsRevision.current});
  }
  function applyColors(colors: TeamColor[]) {
    if (colorSheet?.revision !== Math.max(colorsRevision.current, ev.teams?.colorsRevision ?? 0)) {
      setColorError('Цвета изменились. Закрой шторку, проверь обновлённые цвета и попробуй ещё раз.'); return;
    }
    setColorSheet(null);
    if (JSON.stringify(colors) !== JSON.stringify(draft.colors)) edit({ ...draft, colors }, 'Цвета изменены. Опубликуй составы, чтобы их увидели все.');
  }
  async function publish() {
    if (locked.current || serverChanged || !draft.split.length) return;
    locked.current = true; setBusy(true); setPublishError(null); toast(null);
    try {
      // A lost PATCH response may already be reflected by the refreshed event.
      // Accept only the exact reviewed colors, never a different concurrent edit.
      if (ev.teams?.teamCount === draft.count && (ev.teams.colorsRevision ?? 0) >= colorsRevision.current && JSON.stringify(teamColorsFor(draft.count, ev.teams.colors)) === JSON.stringify(draft.colors)) {
        colorsRevision.current = ev.teams.colorsRevision ?? 0; storedColors.current = [...draft.colors];
        pendingColorWrite.current = null;
        if (ownWrite.current && rosterKeyOf(fromEvent(ev)) === ownWrite.current.roster) ownWrite.current.colorsRevision = colorsRevision.current;
      }
      const guestLevels = Object.fromEntries(ev.main.filter(s => s.userId === null).map(s => [s.id, draft.ratings[s.id]]));
      const saved = JSON.parse(savedKey) as Draft;
      const rosterNeedsSave = !ev.teams || ev.teams.stale || rosterKeyOf(draft) !== (ownWrite.current?.roster ?? rosterKeyOf(saved));
      if (rosterNeedsSave) {
        await api.send('PUT', `/api/events/${ev.id}/teams`, { teamCount: draft.count, teams: draft.split, guestLevels, refreshRatings: draft.fresh || !ev.teams?.ratingSnapshot || ev.teams.stale, ratingSnapshot: draft.ratings });
        ownWrite.current = {roster:rosterKeyOf(draft),colorsRevision:colorsRevision.current};
      }
      if (JSON.stringify(draft.colors) !== JSON.stringify(storedColors.current)) {
        if (!pendingColorWrite.current || pendingColorWrite.current.revision !== colorsRevision.current) pendingColorWrite.current = {colors:[...draft.colors],revision:colorsRevision.current};
        await api.send('PATCH', `/api/events/${ev.id}/teams/colors`, { colors: draft.colors, expectedRevision: colorsRevision.current });
        pendingColorWrite.current = null;
        colorsRevision.current++; storedColors.current = [...draft.colors];
        if (ownWrite.current) ownWrite.current.colorsRevision = colorsRevision.current;
      }
      await api.send('POST', `/api/events/${ev.id}/teams/publish`);
      if (!mounted.current) return;
      setSavedKey(keyOf(draft)); history.current = []; ownWrite.current = null; toast('Составы опубликованы'); haptic('success');
    } catch (failure) {
      if (!mounted.current) return;
      const message = failure instanceof ApiError && failure.status === 409 ? 'Составы или цвета изменились. Проверь обновлённые данные перед публикацией.' : 'Не получилось опубликовать составы. Твой вариант сохранён на экране — попробуй ещё раз.';
      setPublishError(message); toast(message); haptic('error');
    } finally { locked.current = false; if (mounted.current) { setBusy(false); reload(); } }
  }
  async function start() {
    if (locked.current || !canStart) return;
    locked.current = true; setBusy(true); setStartError(null); toast(null);
    startRequest.current ??= { requestId: crypto.randomUUID(), expectedRevision: ev.gameProtocol?.revision ?? 0 };
    try {
      await api.send('POST', `/api/events/${ev.id}/games/start`, startRequest.current);
      if (!mounted.current) return;
      setConfirmStart(false); reload(); navigate(`/event/${ev.id}?tab=games`);
    } catch (failure) {
      if (!mounted.current) return;
      setStartError(failure instanceof ApiError && failure.status === 409 ? 'Составы изменились. Обнови и подтверди их перед стартом.' : 'Не получилось начать матч. Попробуй ещё раз.');
      if (failure instanceof ApiError && failure.status === 409) { startRequest.current = null; reload(); }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  if (!ev.main.length) return <EmptyState title="Нет игроков для составов" text="Сначала запиши участников на матч." action={<Link href={`/event/${ev.id}`} className="btn">К списку участников</Link>} />;
  const source = selected === null ? -1 : draft.split.findIndex(ids => ids.includes(selected));
  const publishButton = <button className={`btn ${actionBlocked || canStart ? '' : 'primary'} wide`} disabled={busy || serverChanged || draft.split.some(ids => !ids.length)} onClick={publish}>{busy ? 'Сохраняем…' : 'Опубликовать составы'}</button>;
  return <div className="team-editor">
    <div className="team-editor-title"><h2 className="sr-only">Составы</h2><span className="muted">{changed || !ev.teams?.publishedAt ? 'Черновик' : 'Опубликованы'}</span></div>
    {ev.teams?.stale && <p className="card warn-note">Состав изменился — пересобери команды</p>}
    {serverChanged && <div className="card warn-note"><p>Составы на сервере изменились. Твой вариант сохранён на экране.</p><button className="btn" disabled={busy} onClick={resetToServer}>Загрузить составы</button></div>}
    <div className="team-editor-setup"><div className="team-count-control" aria-label="Количество команд">{([2, 3] as const).map(count => <button type="button" key={count} aria-pressed={draft.count === count} disabled={busy} onClick={() => { if (count === draft.count) return; if (draft.split.length) setRegenerate(count); else edit({ ...draft, count, colors: teamColorsFor(count, draft.colors) }, 'Количество команд изменено'); }}>{count} команды</button>)}</div><button className="btn-text team-text-action" disabled={busy} onClick={openColors}><Icon name="shirt" />Цвета команд</button></div>
    {draft.split.length ? <><div className="team-editor-tools"><button className="btn-text team-text-action" disabled={busy} onClick={() => { toast(null); setRegenerate(draft.count); }}><Icon name="shuffle" />Другой вариант</button><button className="btn-text team-text-action" disabled={busy || !history.current.length} onClick={undo}><Icon name="undo" />Отменить</button></div><p className="muted team-editor-hint">Нажми «Обменять» и выбери игрока из другой команды.</p></> : <><p className="muted">Выбери цвета формы или манишек на площадке, затем распредели игроков.</p>{actionBlocked ? <button className="btn primary wide" disabled={busy} onClick={() => divide(draft.count)}>Разделить на команды</button> : <MatchAction><button className="btn primary wide" disabled={busy} onClick={() => divide(draft.count)}>Разделить на команды</button></MatchAction>}</>}
    {draft.split.map((ids, index) => <TeamBlock key={index} index={index} colors={draft.colors} ids={ids} byId={byId} average={ids.length ? ids.reduce((sum, id) => sum + (draft.ratings[id] ?? 5), 0) / ids.length : 0} onColor={busy ? undefined : openColors}>{s => <>
      <div className="team-player-identity"><div>{s.userId !== null ? <button type="button" className="btn-plain player-profile-link" disabled={busy} onClick={() => { toast(null); setProfileId(s.userId); }}>{s.name}</button> : <span>{s.name}</span>}{s.userId === me.userId && <span className="you">ты</span>}</div>{s.userId === null ? <label className="team-guest-rating">Уровень гостя<select aria-label={`Уровень гостя ${s.name}`} value={draft.ratings[s.id] ?? 5} disabled={busy} onChange={event => edit({ ...draft, ratings: { ...draft.ratings, [s.id]: Number(event.target.value) } }, 'Уровень гостя изменён')}>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label> : <p className="team-player-meta">Рейтинг {formatRating(draft.ratings[s.id] ?? 5)}</p>}</div>
      <button type="button" className="btn-text team-swap-trigger" aria-label={`Обменять: ${s.name}`} disabled={busy} onClick={() => { toast(null); setSelected(s.id); }}><Icon name="swap" />Обменять</button>
    </>}</TeamBlock>)}
    {publishError && <p className="field-error" role="alert">{publishError}</p>}
    {!!draft.split.length && <>{canStart || actionBlocked ? publishButton : <MatchAction><div className="team-publish-action"><p>{changed ? 'Есть неопубликованные изменения' : 'Этот вариант пока видишь только ты'}</p>{publishButton}</div></MatchAction>}</>}
    {canStart && <MatchAction><button className="btn primary wide" disabled={busy} onClick={() => { toast(null); setConfirmStart(true); }}>Начать матч</button></MatchAction>}
    {selected !== null && source >= 0 && <ActionSheet title="Обменять игрока" onClose={() => setSelected(null)} className="team-swap-sheet"><div><p className={`team-swap-source team-${teamAppearance(source, draft.colors).key}`}><span className="team-dot" aria-hidden="true" />{byId.get(selected)?.name}</p><p className="muted">Сейчас: {teamAppearance(source, draft.colors).name}</p></div><p className="muted">Выбери игрока из другой команды. Они поменяются местами.</p>{draft.split.map((ids, index) => index === source ? null : <section className="team-swap-group" key={index}><h3 className={`team-${teamAppearance(index, draft.colors).key}`}><span className="team-dot" aria-hidden="true" />{teamAppearance(index, draft.colors).name} · {ids.length} {plural(ids.length, 'игрок', 'игрока', 'игроков')}</h3>{ids.map(id => <button type="button" className="team-swap-player" key={id} aria-label={`Обменять с игроком ${byId.get(id)?.name}`} onClick={() => swap(id)}><span>{byId.get(id)?.name}<small>Рейтинг {formatRating(draft.ratings[id] ?? 5)}{byId.get(id)?.userId === null ? ' · гость' : ''}</small></span><span>Обменять</span></button>)}</section>)}<p className="muted">Изменение сохранится в черновике. Его можно отменить.</p></ActionSheet>}
    {colorSheet && <TeamColorSheet colors={colorSheet.colors} players={Array.from({ length: colorSheet.colors.length }, (_, index) => (draft.split[index] ?? []).map(id => byId.get(id)?.name ?? 'Игрок'))} error={colorError} onClose={() => setColorSheet(null)} onApply={applyColors} />}
    {regenerate !== null && <ActionSheet title={regenerate === draft.count ? 'Подобрать другой вариант?' : `Сделать ${regenerate} команды?`} onClose={() => setRegenerate(null)} footer={<button className="btn primary wide" onClick={() => divide(regenerate, regenerate === draft.count)}>Распределить заново</button>}><p>Текущий черновик и ручные перестановки заменятся новым распределением. Если результат не подойдёт, нажми «Отменить».</p></ActionSheet>}
    {confirmStart && <ActionSheet title="Начать матч?" onClose={() => setConfirmStart(false)} busy={busy} footer={<button className="btn primary wide" disabled={busy || !canStart} onClick={start}>{busy ? 'Начинаем…' : 'Начать матч'}</button>}><p>Проверь на площадке: цвета в приложении должны совпадать с формой или манишками.</p><div className="team-start-colors">{draft.colors.map((_, index) => <span className={`team-${teamAppearance(index, draft.colors).key}`} key={index}><span className="team-dot" aria-hidden="true" />{teamAppearance(index, draft.colors).name} · {draft.split[index]?.length ?? 0}</span>)}</div><p>Составы фиксируются на весь матч. Цвета по-прежнему можно исправить.</p>{startError && <p className="field-error" role="alert">{startError}</p>}</ActionSheet>}
    {profileId !== null && <PlayerProfileSheet userId={profileId} onClose={() => setProfileId(null)} />}
  </div>;
}

export function Teams(p: Props) {
  return canManageEvent(p.ev) && isOpen(p.ev.status) && p.ev.gameProtocol?.state !== 'playing' && p.ev.gameProtocol?.state !== 'completed' ? <TeamEditor key={p.ev.main.map(s => s.id).join(',')} {...p} /> : <PublishedTeams {...p} />;
}
