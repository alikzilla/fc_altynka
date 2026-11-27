import { plural, teamAppearance, type EventDetailDto, type GameProtocolDto } from '@altynka/core';
import { Fragment, useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { ActionSheet } from '../components/ActionSheet';
import { CurrentPair } from '../components/CurrentPair';
import { GameTeamName } from '../components/GameTeamName';
import { GameTimer } from '../components/GameTimer';
import { Icon } from '../components/Icon';
import { MatchAction } from '../components/MatchAction';
import { ConfirmButton, ErrorNote, Screen } from '../components/ui';
import { GameScreenSkeleton } from '../components/skeletons';
import { useGameTimer } from '../hooks/useGameTimer';
import { useHeroMaterial } from '../lib/heroMaterial';
import { useResource } from '../hooks/useResource';
import { GameResultSheet } from './GameResultSheet';
import { FinishMatchSheet, useGameProtocolActions } from './gameProtocolActions';

const POLL_MS = 3000;
const HINT_KEY = 'altynka:game-screen-hint';

function hintSeen(): boolean {
  try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return true; }
}

/** The current game on the sideline: pair, shared timer, result entry and a compact table. */
export function GameScreen() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const back = `/event/${id}?tab=games`;
  const { data: ev, error, loading, reload, poll } = useResource<EventDetailDto>(`/api/events/${id}`);
  const playing = ev?.gameProtocol?.state === 'playing';
  // A cached copy from before the coin toss must not bounce the screen back while its refresh is on the way.
  const leave = !!ev && !playing && !loading;
  useEffect(() => { if (leave) navigate(back, { replace: true }); }, [leave, back, navigate]);
  // Everyone sees the next pair and the timer within a few seconds; nothing is fetched while hidden.
  // On a slow pitch-side network a poll waits for the response still in flight instead of cancelling it.
  useEffect(() => {
    if (!playing) return;
    const visible = () => document.visibilityState === 'visible';
    const timer = setInterval(() => { if (visible()) poll(); }, POLL_MS);
    const onVisible = () => { if (visible()) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [playing, poll]);
  if (ev && playing) return <GameView ev={ev} protocol={ev.gameProtocol!} reload={reload} back={back} />;
  return <Screen title="Игра" back={back} className="match-screen game-screen">
    {error ? <ErrorNote text={error.status === 404 ? 'Матч не найден' : 'Не получилось загрузить матч'} retry={reload} /> : (loading || !ev) && <GameScreenSkeleton />}
  </Screen>;
}

function GameView({ ev, protocol, reload, back }: { ev: EventDetailDto; protocol: GameProtocolDto; reload: () => void; back: string }) {
  const timer = useGameTimer(ev);
  const hero = useHeroMaterial('material-blue');
  const [result, setResult] = useState(false);
  const [menu, setMenu] = useState(false);
  const actions = useGameProtocolActions(ev, reload, () => setMenu(false));
  const { busy, error, pendingFinish } = actions;
  const sequence = protocol.games.length + 1;
  const colors = ev.teams?.colors;
  // The wake-lock hint is for phones that play the signals: shown on the first visit that does, then never again.
  const [seen] = useState(hintSeen);
  const hint = !seen && (timer.canControl || timer.sound === 'on');
  useEffect(() => { if (hint) try { localStorage.setItem(HINT_KEY, '1'); } catch { /* shown again next time */ } }, [hint]);
  const date = new Date(`${ev.date}T12:00:00Z`);
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long', weekday: 'long' }).format(date);
  const subtitle = day.charAt(0).toUpperCase() + day.slice(1);
  return <Screen title={`Игра ${sequence}`} subtitle={subtitle} back={back} className="match-screen game-screen">
    <div className="match-games game-screen-body">
      {protocol.currentPair && <section className={`card ${hero.className} game-current game-current-compact`} style={hero.style} aria-label="Текущая игра"><CurrentPair protocol={protocol} colors={colors} /></section>}
      <GameTimer view={timer} />
      {hint && <p className="muted game-screen-hint">Экран не погаснет сам. Можно заблокировать телефон — сигналы прозвучат.</p>}
      <section className="card material-graphite game-standings-section" aria-labelledby="game-screen-table-heading"><h2 id="game-screen-table-heading">Таблица</h2>
        <table className="game-standings game-screen-standings" aria-label="Таблица команд">
          <thead><tr><th scope="col">Команда</th><th scope="col"><abbr title="Игры">И</abbr></th><th scope="col">Очки</th></tr></thead>
          <tbody>{protocol.standings.map(t => <tr key={t.teamIndex}><th scope="row"><span className="game-rank">{t.rank}</span><GameTeamName colors={colors} index={t.teamIndex} /></th><td>{t.played}</td><td className="game-points">{t.points}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
    {protocol.canRecord && <MatchAction label="Протокол игры"><div className="match-action-pair">
      <button className="btn primary wide" onClick={event => { event.currentTarget.focus(); setResult(true); }}>Внести результат</button>
      <button className="btn match-action-more" aria-label="Действия" onClick={() => { actions.clearError(); setMenu(true); }}><Icon name="more" /></button>
    </div></MatchAction>}
    {result && <GameResultSheet ev={ev} protocol={protocol} game={null} onClose={() => setResult(false)} onSaved={() => { setResult(false); reload(); }} reload={reload} />}
    {menu && <ActionSheet title="Протокол матча" onClose={() => setMenu(false)} busy={busy}>
      {timer.status !== 'waiting' && <ConfirmButton className="sheet-action" label="Сбросить таймер" confirmLabel={`Сбросить таймер игры ${sequence}?`} disabled={busy} onConfirm={() => { timer.reset(); setMenu(false); }} />}
      {protocol.canUndo && !pendingFinish && <ConfirmButton className="sheet-action danger-text" label="Отменить последнюю запись" confirmLabel={`Убрать результат игры ${protocol.games.at(-1)?.sequence}?`} disabled={busy} onConfirm={actions.undo} />}
      {protocol.canFinish && <button className="sheet-action" onClick={actions.openFinish}>{pendingFinish ? 'Проверить завершение' : 'Завершить матч'}</button>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </ActionSheet>}
    {actions.finishing && <FinishMatchSheet protocol={protocol} actions={actions} />}
  </Screen>;
}
