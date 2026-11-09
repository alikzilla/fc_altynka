import { alternativeSplit, balanceTeams, formatRating, plural, teamAppearance, teamColorsFor, teamCountFor, todayAlmaty, type EventDetailDto, type SignupDto, type TeamColor, type TeamCount } from '@altynka/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
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
import { TeamShirt } from '../components/TeamShirt';
import { StartMatchSheet } from './StartMatchSheet';

type Props = { ev: EventDetailDto; reload: () => void; actionBlocked?: boolean };
type EditorProps = Props & { onStart: () => void };
type Draft = { count: TeamCount; split: number[][]; colors: TeamColor[]; ratings: Record<number, number>; fresh: boolean };
type ColorSelection = { index: number; colors: TeamColor[]; revision: number };
const copy = (d: Draft): Draft => ({ ...d, split: d.split.map(ids => [...ids]), colors: [...d.colors], ratings: { ...d.ratings } });
const keyOf = (d: Draft) => JSON.stringify(d);
const rosterKeyOf = (d: Draft) => JSON.stringify({ count:d.count, split:d.split.map(ids => [...ids].sort((a,b) => a-b)), ratings:d.ratings });
function fromEvent(ev: EventDetailDto): Draft {
  const count = ev.teams?.teamCount ?? teamCountFor(ev.main.length);
  return { count, split: ev.teams && !ev.teams.stale ? ev.teams.teams.map(ids => [...ids]) : [], colors: teamColorsFor(count, ev.teams?.colors), ratings: Object.fromEntries(ev.main.map(s => [s.id, ev.teams?.ratingSnapshot?.[s.id] ?? s.level ?? 5])), fresh: false };
}

/** Rating colour follows the rating ring: 1 grey, 2–3 green, 4–7 yellow, 8–9 orange, 10 red. */
function ratingTone(rating: number): string {
  return rating >= 10 ? 'tone-10' : rating >= 8 ? 'tone-8' : rating >= 4 ? 'tone-4' : rating >= 2 ? 'tone-2' : 'tone-1';
}

function TeamCard({ index, colors, ids, byId, meta, own, onKit, children }: { index: number; colors: TeamColor[]; ids: number[]; byId: Map<number, SignupDto>; meta?: string; own?: boolean; onKit?: () => void; children: (s: SignupDto) => ReactNode }) {
  const t = teamAppearance(index, colors);
  return <section className={`card material-graphite team-card team-${t.key}`} role="group" aria-label={t.name}>
    <header className="team-card-head"><TeamShirt /><div className="team-card-title"><h2>{t.name}</h2>{(meta || own) && <p className="team-card-meta">{own && <span className="team-own-tag">Твоя команда</span>}{meta}</p>}</div>
      {onKit && <button type="button" className="team-kit-chip" aria-label={`Изменить цвет: ${t.name}`} onClick={onKit}><span className="team-dot" aria-hidden="true" />Форма</button>}</header>
    <ul className="team-card-players">{ids.map(id => { const s = byId.get(id); return s ? <li className="team-card-player" key={id}>{children(s)}</li> : null; })}</ul>
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
  const ownTeam = ownSignup ? ev.teams?.teams.findIndex(ids => ids.includes(ownSignup.id)) ?? -1 : -1;
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
  // The viewer's own team leads.
  const order = ev.teams.teams.map((_, i) => i).sort((a, b) => Number(b === ownTeam) - Number(a === ownTeam));
  return <div className="team-editor">
    <h2 className="sr-only">Составы</h2>
    {ev.gameProtocol?.state === 'playing' && <p className="team-live-note">Матч идёт{canColor ? ' · цвета можно исправить под манишки' : ''}</p>}
    {ev.teams.stale && <p className="card warn-note">Участники изменились. Организатор обновит составы перед игрой.</p>}
    {order.map(i => <TeamCard key={i} index={i} colors={colors} ids={ev.teams!.teams[i]} byId={byId} own={i === ownTeam} onKit={canColor && !busy ? () => { setError(null); setColorSheet({ index: i, colors: [...colors], revision: ev.teams?.colorsRevision ?? 0 }); } : undefined}>{s => <div className={`team-row-static ${s.userId === me.userId ? 'team-self' : ''}`}>{s.userId !== null ? <button className="btn-plain player-profile-link" onClick={() => setProfileId(s.userId)}>{s.name}</button> : <span>{s.name}<span className="team-guest-tag">гость</span></span>}{s.userId === me.userId && <span className="you">ты</span>}</div>}</TeamCard>)}
    {profileId !== null && <PlayerProfileSheet userId={profileId} onClose={() => setProfileId(null)} />}
    {colorSheet && <TeamColorSheet index={colorSheet.index} colors={colorSheet.colors} busy={busy} error={error} onClose={() => setColorSheet(null)} onPick={saveColors} />}
  </div>;
}

function TeamEditor({ ev, reload, actionBlocked, onStart }: EditorProps) {
  const toast = useToast();
  const me = useMe();
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
  const [guestLevel, setGuestLevel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const colorsRevision = useRef(ev.teams?.colorsRevision ?? 0);
  const storedColors = useRef(teamColorsFor(draft.count, ev.teams?.colors));
  const ownWrite = useRef<{roster:string; colorsRevision:number} | null>(null);
  const pendingColorWrite = useRef<{ colors: TeamColor[]; revision: number } | null>(null);
  const shuffleIcon = useRef<HTMLSpanElement>(null);
  const flipped = useRef(false);
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
  function openColors(index: number) {
    toast(null); setSelected(null); setColorError(null); setColorSheet({index,colors:[...draft.colors],revision:colorsRevision.current});
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
  }  function tap(id: number) {
    if (busy) return;
    toast(null);
    if (selected === null || selected === id) { setSelected(selected === id ? null : id); return; }
    const from = draft.split.findIndex(ids => ids.includes(selected));
    const to = draft.split.findIndex(ids => ids.includes(id));
    if (from === to) setSelected(id); else swap(id);
  }
  function shuffle() {
    if (busy) return;
    toast(null); setSelected(null);
    divide(draft.count, true);
    // The shuffle glyph mirrors top-to-bottom: flipping makes its arrows cross and land in a valid pose, so it never snaps back.
    const icon = shuffleIcon.current;
    if (icon?.animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const from = flipped.current ? -1 : 1, to = -from; flipped.current = !flipped.current;
      icon.animate([{ transform: `scaleY(${from})` }, { transform: `scaleY(${to * .15}) scaleX(1.12)`, offset: .45 }, { transform: `scaleY(${to * 1.12})`, offset: .78 }, { transform: `scaleY(${to})` }], { duration: 460, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
    }
  }
  function changeCount(count: TeamCount) {
    if (busy || count === draft.count) return;
    setSelected(null);
    if (draft.split.length) divide(count); else edit({ ...draft, count, colors: teamColorsFor(count, draft.colors) }, 'Количество команд изменено');
  }
  useEffect(() => {
    if (selected === null) return;
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [selected]);

  if (!ev.main.length) return <EmptyState title="Нет игроков для составов" text="Сначала запиши участников на матч." action={<Link href={`/event/${ev.id}`} className="btn">К списку участников</Link>} />;
  const source = selected === null ? -1 : draft.split.findIndex(ids => ids.includes(selected));
  const averages = draft.split.map(ids => ids.length ? ids.reduce((sum, id) => sum + (draft.ratings[id] ?? 5), 0) / ids.length : 0);
  const gap = averages.length ? Math.max(...averages) - Math.min(...averages) : 0;
  const published = !!ev.teams?.publishedAt && !changed && remoteMatchesDraft && !serverChanged;
  const futureDay = ev.date > todayAlmaty(new Date());
  const undoButton = history.current.length > 0 && <button type="button" className="btn team-undo" aria-label="Отменить последнее изменение" disabled={busy} onClick={undo}><Icon name="undo" /></button>;
  const publishButton = <button className="btn primary wide" disabled={busy || serverChanged || draft.split.some(ids => !ids.length)} onClick={publish}>{busy ? 'Сохраняем…' : 'Опубликовать составы'}</button>;
  const picked = selected === null ? null : byId.get(selected);
  const panel = picked ? <div className="team-pick-row"><span className="team-pick-label"><Icon name="swap" />Обмен: <b>{picked.name}</b></span><button type="button" className="btn team-pick-cancel" onClick={() => setSelected(null)}>Отмена</button></div>
    : !draft.split.length ? null
    : published ? <div className="team-panel"><p className="team-panel-status"><span className="team-status-dot ok" aria-hidden="true" />Опубликованы — видят все</p>{canStart ? <div className="team-panel-row">{undoButton}<button className="btn primary wide" disabled={busy} onClick={() => { toast(null); onStart(); }}>Начать матч</button></div> : futureDay && ev.protocolVersion === 1 && <p className="team-panel-hint">Начать матч можно в день игры</p>}</div>
    : <div className="team-panel"><p className="team-panel-status"><span className="team-status-dot" aria-hidden="true" />{ev.teams?.publishedAt ? 'Есть неопубликованные изменения' : 'Черновик — видишь только ты'}</p><div className="team-panel-row">{undoButton}{publishButton}</div></div>;
  return <div className="team-editor">
    <h2 className="sr-only">Составы</h2>
    {ev.teams?.stale && <p className="card warn-note">Состав изменился — пересобери команды</p>}
    {serverChanged && <div className="card warn-note"><p>Составы на сервере изменились. Твой вариант сохранён на экране.</p><button className="btn" disabled={busy} onClick={resetToServer}>Загрузить составы</button></div>}
    <section className="card material-blue team-balance" aria-label="Баланс команд">
      <div className="team-count-control" role="group" aria-label="Количество команд">{([2, 3] as const).map(count => <button type="button" key={count} aria-pressed={draft.count === count} disabled={busy} onClick={() => changeCount(count)}>{count} команды</button>)}</div>
      {draft.split.length ? <>
        <div className="team-bars">{draft.split.map((_, i) => { const t = teamAppearance(i, draft.colors); return <div className={`team-bar team-${t.key}`} key={i}><span className="team-bar-name"><span className="team-dot" aria-hidden="true" />{t.name}</span><span className="team-bar-track" aria-hidden="true"><span className="team-bar-fill" style={{ width: `${Math.max(4, Math.min(100, (averages[i] - 3) / 6 * 100))}%` }} /></span><b>{formatRating(averages[i])}</b></div>; })}</div>
        <p className="team-gap">Разница средних — {formatRating(gap)}</p>
        <button type="button" className="btn wide team-shuffle" disabled={busy} onClick={shuffle}><span className="team-shuffle-icon" ref={shuffleIcon}><Icon name="shuffle" /></span>Перемешать</button>
      </> : <button className="btn primary wide" disabled={busy} onClick={() => divide(draft.count)}>Разделить на команды</button>}
    </section>
    <div className={`team-cards ${selected !== null ? 'selecting' : ''}`}>{draft.split.map((ids, index) => <TeamCard key={index} index={index} colors={draft.colors} ids={[...ids].sort((a, b) => (draft.ratings[b] ?? 5) - (draft.ratings[a] ?? 5))} byId={byId} meta={`${ids.length} ${plural(ids.length, 'игрок', 'игрока', 'игроков')} · ${formatRating(averages[index])}`} onKit={busy ? undefined : () => openColors(index)}>{s => {
      const rating = draft.ratings[s.id] ?? 5;
      const state = s.id === selected ? 'selected' : source === index ? 'dimmed' : source >= 0 ? 'target' : '';
      return <div className={`team-row ${state}`}>
        <button type="button" className="team-row-main" aria-label={s.name} aria-pressed={s.id === selected} disabled={busy} onClick={() => tap(s.id)}>
          <span className="team-row-name">{s.name}{s.userId === me.userId && <span className="you">ты</span>}{s.userId === null && <span className="team-guest-tag">гость</span>}</span>
          {state === 'target' && <span className="team-row-swap" aria-hidden="true"><Icon name="swap" /></span>}
          {s.userId !== null && <span className={`team-rating ${ratingTone(rating)}`}>{formatRating(rating)}</span>}
        </button>
        {s.userId === null && <button type="button" className={`team-rating team-guest-level ${ratingTone(rating)}`} aria-label={`Уровень гостя ${s.name}: ${rating}`} disabled={busy} onClick={() => { toast(null); setSelected(null); setGuestLevel(s.id); }}>{formatRating(rating)}</button>}
      </div>;
    }}</TeamCard>)}</div>
    {publishError && <p className="field-error" role="alert">{publishError}</p>}
    {panel && (actionBlocked && !picked ? <div className="team-panel-inline">{panel}</div> : <MatchAction label={picked ? 'Обмен игроков' : 'Действие матча'}>{panel}</MatchAction>)}
    {guestLevel !== null && <ActionSheet title={`Уровень гостя: ${byId.get(guestLevel)?.name ?? ''}`} onClose={() => setGuestLevel(null)} className="team-level-sheet">
      <div className="team-level-options">{Array.from({ length: 10 }, (_, i) => i + 1).map(level => <button type="button" key={level} className="team-level-option" aria-pressed={(draft.ratings[guestLevel] ?? 5) === level} onClick={() => { edit({ ...draft, ratings: { ...draft.ratings, [guestLevel]: level } }, 'Уровень гостя изменён'); setGuestLevel(null); }}>{level}</button>)}</div>
    </ActionSheet>}
    {colorSheet && <TeamColorSheet index={colorSheet.index} colors={colorSheet.colors} error={colorError} onClose={() => setColorSheet(null)} onPick={applyColors} />}
    {profileId !== null && <PlayerProfileSheet userId={profileId} onClose={() => setProfileId(null)} />}
  </div>;
}

export function Teams(p: Props) {
  const [starting, setStarting] = useState(false);
  const editing = canManageEvent(p.ev) && isOpen(p.ev.status) && p.ev.gameProtocol?.state !== 'playing' && p.ev.gameProtocol?.state !== 'completed';
  return <>
    {editing ? <TeamEditor key={p.ev.main.map(s => s.id).join(',')} {...p} onStart={() => setStarting(true)} /> : <PublishedTeams {...p} />}
    {starting && <StartMatchSheet ev={p.ev} reload={p.reload} onClose={() => setStarting(false)} />}
  </>;
}
