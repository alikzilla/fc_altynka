import { GAME_TIMER_MAX_SEC, GAME_TIMER_MIN_SEC, timerCues, type TimerCue } from '@altynka/core';
import type { GameTimerView } from '../hooks/useGameTimer';
import { Icon } from './Icon';

/** «M:SS» of whole seconds. */
export function clockText(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
/** What is left, counted down: 5:59.2 still reads «6:00» and the end reads «0:00». */
const leftText = (remainingSec: number) => clockText(Math.ceil(Math.max(remainingSec, 0)));

/** The horseshoe: a 270° arc open at the bottom, 0° at the top, angles clockwise. */
const DIAL = { cx: 150, cy: 150, r: 118, from: -135, to: 135 };
/** A passed signal stays highlighted this long, so the eye catches the mark that just sounded. */
const FRESH_SEC = 3;

function dialPoint(deg: number, r = DIAL.r): [number, number] {
  const a = (deg - 90) * Math.PI / 180;
  return [DIAL.cx + r * Math.cos(a), DIAL.cy + r * Math.sin(a)];
}
function dialArc(from: number, to: number): string {
  const [x1, y1] = dialPoint(from), [x2, y2] = dialPoint(Math.max(to, from + .01));
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${DIAL.r} ${DIAL.r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
const dialAngle = (fraction: number) => DIAL.from + (DIAL.to - DIAL.from) * Math.min(Math.max(fraction, 0), 1);
/** «1:00» and «0:15» name the two warnings; the start and the final whistle are the arc's own ends. */
const cueLabel = (cue: TimerCue, durationSec: number) => cue.kind === 'last_minute' || cue.kind === 'last_attack' ? clockText(durationSec - cue.atSec) : null;

/**
 * What is left as an arc that empties clockwise behind a moving knob, with a mark at every signal of the track.
 * Decorative: the digits beside it carry the time for assistive technology.
 */
function GameDial({ view }: { view: GameTimerView }) {
  const elapsed = view.durationSec - view.remainingSec;
  const now = dialAngle(elapsed / view.durationSec);
  const [kx, ky] = dialPoint(now);
  return <svg className="game-dial" viewBox="-26 18 352 236" aria-hidden="true" focusable="false">
    <path className="game-dial-track" d={dialArc(DIAL.from, DIAL.to)} />
    {view.remainingSec > 0 && <path className="game-dial-left" d={dialArc(now, DIAL.to)} />}
    {timerCues(view.durationSec).map(cue => {
      const deg = dialAngle(cue.atSec / view.durationSec);
      const [x, y] = dialPoint(deg);
      const [lx, ly] = dialPoint(deg, DIAL.r + 24);
      const passed = view.status !== 'waiting' && elapsed >= cue.atSec;
      const fresh = passed && view.status === 'running' && elapsed - cue.atSec < FRESH_SEC;
      const label = cueLabel(cue, view.durationSec);
      return <g key={cue.kind} className={`game-dial-cue game-dial-cue-${cue.kind}${passed ? ' passed' : ''}${fresh ? ' fresh' : ''}`}>
        <circle cx={x} cy={y} r={fresh ? 7 : 4} />
        {label && <text x={lx} y={ly + 4} textAnchor={deg < 0 ? 'end' : 'start'}>{label}</text>}
      </g>;
    })}
    <circle className="game-dial-knob" cx={kx} cy={ky} r={10} />
  </svg>;
}

/** Phase words for everything but added time, which also shows how much has been played over. */
function phaseText(view: GameTimerView): string {
  if (view.status === 'waiting') return 'Ждём старта';
  if (view.status === 'paused') return 'Пауза';
  if (view.phase === 'last_minute') return 'Последняя минута';
  if (view.phase === 'last_attack') return 'Последняя атака';
  return 'Игра идёт';
}

/**
 * The shared game time: a horseshoe dial with the signal marks, big digits and the phase for everyone;
 * for the organizer the dial's inner disc starts, pauses and resumes, and a stepper sets the duration.
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
  // The organizer starts, pauses and resumes by tapping inside the horseshoe: the whole inner disc is the button.
  const toggle = view.status === 'waiting' ? { label: 'Старт игры', icon: 'play' as const, run: () => void view.start() }
    : view.status === 'running' ? { label: 'Пауза', icon: 'pause' as const, run: view.pause }
    : { label: 'Продолжить', icon: 'play' as const, run: () => void view.resume() };
  return <section className={`card material-graphite game-timer game-timer-${tone}${view.canControl ? ' game-timer-control' : ''}`} aria-label="Таймер игры">
    <div className="game-dial-frame">
      <GameDial view={view} />
      {view.canControl && <button type="button" className="game-dial-button" aria-label={toggle.label} onClick={toggle.run}>
        <span className="game-dial-icon"><Icon name={toggle.icon} /></span>
      </button>}
      <div className="game-dial-center">
        <p className="game-timer-digits" role="timer">{leftText(view.remainingSec)}</p>
        {/* Announced once per phase; the added time ticks visibly but is not read out every second. */}
        <p className="game-timer-phase" aria-live="polite">{overtime ? <>Время <span aria-hidden="true">+{clockText(Math.floor(-view.remainingSec))}</span></> : phaseText(view)}</p>
      </div>
    </div>
    {view.canControl && view.status === 'waiting' && <div className="game-timer-duration" role="group" aria-label="Длительность игры">
      <button type="button" aria-label="Меньше" disabled={view.durationSec <= GAME_TIMER_MIN_SEC} onClick={() => view.setDurationSec(view.durationSec - 60)}>−</button>
      <output>{minutes} мин</output>
      <button type="button" aria-label="Больше" disabled={view.durationSec >= GAME_TIMER_MAX_SEC} onClick={() => view.setDurationSec(view.durationSec + 60)}>+</button>
    </div>}
    <div className="game-timer-controls">{signals()}</div>
    {view.trackFailed && !overtime && <p className="muted game-timer-note" role="status">Сигналы не загрузились — проверь интернет</p>}
  </section>;
}
