import { GAME_TIMER_MAX_SEC, GAME_TIMER_MIN_SEC } from '@altynka/core';
import type { GameTimerView } from '../hooks/useGameTimer';

/** «M:SS» of whole seconds. */
export function clockText(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
/** What is left, counted down: 5:59.2 still reads «6:00» and the end reads «0:00». */
const leftText = (remainingSec: number) => clockText(Math.ceil(Math.max(remainingSec, 0)));

/** Phase words for everything but added time, which also shows how much has been played over. */
function phaseText(view: GameTimerView): string {
  if (view.status === 'waiting') return 'Ждём старта';
  if (view.status === 'paused') return 'Пауза';
  if (view.phase === 'last_minute') return 'Последняя минута';
  if (view.phase === 'last_attack') return 'Последняя атака';
  return 'Игра идёт';
}

/**
 * The shared game time: big digits and the phase for everyone; start, pause and duration for the organizer.
 * Start and resume never wait for the signals: without a ready track the time runs silently and
 * «Продолжить сигналы» becomes available once the track is built. Only the sound buttons wait for it.
 */
export function GameTimer({ view }: { view: GameTimerView }) {
  const overtime = view.status === 'running' && view.phase === 'over';
  const tone = view.status === 'running' ? view.phase : view.status;
  const minutes = view.durationSec / 60;
  const signals = () => {
    if (view.phase === 'over' || view.status === 'waiting') return null;
    if (view.canControl) {
      return view.sound === 'resumable'
        ? <button type="button" className="btn wide" disabled={!view.trackReady} onClick={() => void view.listen()}>Продолжить сигналы (осталось {leftText(view.remainingSec)})</button>
        : null;
    }
    return view.sound === 'on'
      ? <button type="button" className="btn wide" onClick={view.mute}>Выключить сигналы</button>
      : <button type="button" className="btn wide" disabled={!view.trackReady} onClick={() => void view.listen()}>Слышать сигналы</button>;
  };
  return <section className={`card material-graphite game-timer game-timer-${tone}`} aria-label="Таймер игры">
    <p className="game-timer-digits" role="timer">{leftText(view.remainingSec)}</p>
    {/* Announced once per phase; the added time ticks visibly but is not read out every second. */}
    <p className="game-timer-phase" aria-live="polite">{overtime ? <>Время <span aria-hidden="true">+{clockText(Math.floor(-view.remainingSec))}</span></> : phaseText(view)}</p>
    {view.canControl && view.status === 'waiting' && <div className="game-timer-duration" role="group" aria-label="Длительность игры">
      <button type="button" aria-label="Меньше" disabled={view.durationSec <= GAME_TIMER_MIN_SEC} onClick={() => view.setDurationSec(view.durationSec - 60)}>−</button>
      <output>{minutes} мин</output>
      <button type="button" aria-label="Больше" disabled={view.durationSec >= GAME_TIMER_MAX_SEC} onClick={() => view.setDurationSec(view.durationSec + 60)}>+</button>
    </div>}
    <div className="game-timer-controls">
      {view.canControl && (view.status === 'waiting'
        ? <button type="button" className="btn primary wide" onClick={() => void view.start()}>Старт игры</button>
        : view.status === 'running'
          ? <button type="button" className="btn wide" onClick={view.pause}>Пауза</button>
          : <button type="button" className="btn primary wide" onClick={() => void view.resume()}>Продолжить</button>)}
      {signals()}
    </div>
    {view.trackFailed && !overtime && <p className="muted game-timer-note" role="status">Сигналы не загрузились — проверь интернет</p>}
  </section>;
}
