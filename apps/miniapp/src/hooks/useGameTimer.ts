import {
  GAME_TIMER_MAX_SEC, GAME_TIMER_MIN_SEC, timerElapsedMs, timerPhase, timerRemainingSec,
  type EventDetailDto, type GameTimer, type StoredGameTimer, type TimerPhase,
} from '@altynka/core';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { effectiveTimer, isFinalRejection, type LocalTimer } from '../lib/gameTimerState';
import { clearPendingTimer, readPendingTimer, readTimerDuration, writePendingTimer, writeTimerDuration } from '../lib/gameTimerStore';
import { keepAwake } from '../lib/keepAwake';
import { resourceReceivedAt } from '../lib/queryClient';
import { noteServerTime, serverNow, toServerTime } from '../lib/serverClock';
import { haptic } from '../lib/tg';
import { TRACK_TAIL_SEC, buildTrack } from '../lib/timerTrack';

export interface GameTimerView {
  status: 'waiting' | 'running' | 'paused';
  remainingSec: number; phase: TimerPhase;
  durationSec: number; setDurationSec(sec: number): void; // только в waiting
  sound: 'off' | 'on' | 'resumable';                       // resumable — состояние есть, звука нет после перезапуска
  canControl: boolean;                                      // ev.gameProtocol.canRecord
  trackReady: boolean;                                      // трек длительности durationSec собран: play() прямо в жесте
  start(): Promise<void>; pause(): void; resume(): Promise<void>; reset(): void;
  listen(): Promise<void>; mute(): void;
}

export function useGameTimer(ev: EventDetailDto): GameTimerView {
  const protocol = ev.gameProtocol;
  const playing = protocol?.state === 'playing';
  const gameSequence = (protocol?.games.length ?? 0) + 1;
  const canControl = !!protocol?.canRecord;

  const noted = useRef<EventDetailDto | null>(null);
  if (noted.current !== ev) {
    noted.current = ev;
    if (typeof ev.serverNow === 'number') noteServerTime(ev.serverNow, resourceReceivedAt(ev) ?? performance.now());
  }
  const evRef = useRef(ev);
  evRef.current = ev;

  const [local, setLocal] = useState<LocalTimer | null>(() => {
    const pending = readPendingTimer(ev.id);
    return pending ? { timer: pending, confirmedAt: null } : null;
  });
  const localRef = useRef(local);
  const applyLocal = (next: LocalTimer | null) => { localRef.current = next; setLocal(next); };
  const current = () => effectiveTimer(evRef.current, localRef.current);

  const [selected, setSelected] = useState(readTimerDuration);
  const [audio] = useState(() => new Audio());
  const [soundOn, setSoundOn] = useState(false);
  const soundRef = useRef(false);
  const setSound = (on: boolean) => { soundRef.current = on; setSoundOn(on); };
  const [track, setTrack] = useState<{ durationSec: number; url: string } | null>(null);
  const trackRef = useRef(track);
  const keepTrack = (next: { durationSec: number; url: string }) => { trackRef.current = next; setTrack(next); };
  const inFlight = useRef<StoredGameTimer | null>(null);
  const [, setTick] = useState(0);

  const timer = effectiveTimer(ev, local);
  const status = !timer ? 'waiting' : timer.pausedAt !== null ? 'paused' : 'running';
  const durationSec = timer?.durationSec ?? selected;
  const trackReady = track?.durationSec === durationSec;
  const audioPlaying = !audio.paused; // re-rendered by the element's playing/pause/ended events
  const serverRemaining = timer ? timerRemainingSec(timer, serverNow()) : selected;
  // Nothing is left to play once the track has ended or the time is past its tail.
  const trackOver = !!timer && (serverRemaining <= -TRACK_TAIL_SEC || (soundOn && audio.ended));
  const audioDriven = soundOn && status === 'running' && trackReady && audio.src === track.url
    && audioPlaying && audio.currentTime < durationSec + TRACK_TAIL_SEC;
  const remainingSec = audioDriven ? durationSec - audio.currentTime : serverRemaining;
  const phase = timerPhase(remainingSec);
  const sound = !timer || trackOver ? 'off'
    : soundOn && (status === 'paused' || audioPlaying) ? 'on'
    : canControl && status === 'running' ? 'resumable' : 'off';

  /** Brings this device's track in line with the current timer; plays synchronously when the track is ready. */
  const syncAudio = (): Promise<void> | undefined => {
    const t = current();
    if (!soundRef.current || !t || t.pausedAt !== null) { if (!audio.paused) audio.pause(); return; }
    const elapsed = timerElapsedMs(t, serverNow()) / 1000;
    if (elapsed >= t.durationSec + TRACK_TAIL_SEC) { if (!audio.paused) audio.pause(); return; }
    const ready = trackRef.current;
    if (ready?.durationSec !== t.durationSec) {
      return buildTrack(t.durationSec).then(url => { keepTrack({ durationSec: t.durationSec, url }); void syncAudio(); }, () => {});
    }
    if (audio.src !== ready.url) audio.src = ready.url;
    const drifted = Math.abs(audio.currentTime - elapsed) > 1;
    if (audio.paused || drifted) audio.currentTime = elapsed;
    if (audio.paused && (drifted || !audio.ended)) {
      // Only a refused autoplay turns the sound off; an AbortError just means a newer pause or seek won.
      audio.play().catch((error: unknown) => { if ((error as Error)?.name === 'NotAllowedError') setSound(false); });
    }
  };

  const send = (next: StoredGameTimer): Promise<void> => {
    inFlight.current = next;
    return api.send<{ timer: GameTimer | null }>('PUT', `/api/events/${evRef.current.id}/games/timer`, next).then(
      res => {
        if (localRef.current?.timer !== next) return; // a newer tap superseded this write
        clearPendingTimer(evRef.current.id);
        const confirmed = res.timer ?? { gameSequence: next.gameSequence, updatedAt: next.updatedAt, reset: true as const };
        applyLocal({ timer: confirmed, confirmedAt: toServerTime(performance.now()) });
      },
      error => {
        if (!isFinalRejection(error) || localRef.current?.timer !== next) return; // offline: stays pending, re-sent on the next poll
        clearPendingTimer(evRef.current.id);
        applyLocal(null);
      },
    ).finally(() => { if (inFlight.current === next) inFlight.current = null; });
  };
  const record = (next: StoredGameTimer) => { applyLocal({ timer: next, confirmedAt: null }); writePendingTimer(evRef.current.id, next); };
  /** Server time of a tap, never before what this device last saw, so the server orders it after that state. */
  const tapTime = (after?: GameTimer | null) => Math.max(toServerTime(performance.now()), after ? after.updatedAt + 1 : 0);

  const start = async () => {
    if (!canControl || !playing || current()) return;
    const t = tapTime();
    const next: GameTimer = { gameSequence, durationSec: selected, startedAt: t, pausedAt: null, pausedMs: 0, updatedAt: t };
    setSound(true);
    record(next);
    const played = syncAudio();
    await Promise.all([played, send(next)]);
  };
  const pause = () => {
    const t0 = current();
    if (!canControl || !t0 || t0.pausedAt !== null) return;
    const t = tapTime(t0);
    const next: GameTimer = { ...t0, pausedAt: t, updatedAt: t };
    record(next);
    void syncAudio();
    void send(next);
  };
  const resume = async () => {
    const t0 = current();
    if (!canControl || !t0 || t0.pausedAt === null) return;
    const t = tapTime(t0);
    const next: GameTimer = { ...t0, pausedMs: t0.pausedMs + (t - t0.pausedAt), pausedAt: null, updatedAt: t };
    setSound(true);
    record(next);
    const played = syncAudio();
    await Promise.all([played, send(next)]);
  };
  const reset = () => {
    if (!canControl || !playing) return;
    const next = { gameSequence, updatedAt: tapTime(current()), reset: true as const };
    setSound(false);
    record(next);
    void syncAudio();
    void send(next);
  };
  const listen = async () => {
    if (!current()) return;
    setSound(true);
    await syncAudio();
  };
  const mute = () => { setSound(false); audio.pause(); };
  const setDurationSec = (sec: number) => {
    if (status !== 'waiting' || !Number.isInteger(sec) || sec < GAME_TIMER_MIN_SEC || sec > GAME_TIMER_MAX_SEC || sec % 60) return;
    setSelected(sec);
    writeTimerDuration(sec);
  };
  // Lock-screen play: resume a paused timer, or bring back the sound of a running one (e.g. after a call).
  const play = () => (current()?.pausedAt === null ? listen() : resume());
  const actions = useRef({ pause, play, syncAudio });
  actions.current = { pause, play, syncAudio };

  // Every snapshot: drop a pending write the server already has or that belongs to a finished game; re-send the rest.
  useEffect(() => {
    const pending = localRef.current;
    if (!pending || pending.confirmedAt !== null || !ev.gameProtocol) return;
    const server = ev.gameProtocol.timer ?? null;
    const stale = ev.gameProtocol.state !== 'playing' || pending.timer.gameSequence !== ev.gameProtocol.games.length + 1;
    if (stale || (server && server.updatedAt >= pending.timer.updatedAt)) {
      clearPendingTimer(ev.id);
      applyLocal(null);
    } else if (inFlight.current !== pending.timer) void send(pending.timer);
  }, [ev]);

  // A pause, resume, reset or next game seen in a snapshot stops, seeks or restarts this device's track.
  const timerKey = timer ? `${timer.gameSequence}:${timer.updatedAt}:${timer.durationSec}` : null;
  useEffect(() => {
    if (!timerKey && soundRef.current) setSound(false);
    void syncAudio();
  }, [timerKey]);

  // Prebuild the track so start(), resume() and listen() can call play() inside the tap.
  const wanted = timer ? timer.durationSec : canControl && playing ? selected : null;
  useEffect(() => {
    if (wanted === null || trackRef.current?.durationSec === wanted) return;
    let live = true;
    buildTrack(wanted).then(url => {
      if (!live) return;
      keepTrack({ durationSec: wanted, url });
      if (audio.paused && audio.src !== url) audio.src = url; // loads metadata before the tap
    }, () => {});
    return () => { live = false; };
  }, [wanted]);

  // The organizer keeps the screen on while the timer runs; a participant only while there is sound to hear.
  const awake = soundOn && status === 'running' && (canControl || !trackOver);
  useEffect(() => {
    if (!awake) return;
    const handle = keepAwake();
    return () => handle.release();
  }, [awake]);

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => {
      setTick(n => n + 1);
      if (!audio.paused) void actions.current.syncAudio(); // seeks a track that drifted more than 1 s
    }, 250);
    return () => clearInterval(id);
  }, [status, audio]);

  useEffect(() => {
    const rerender = () => setTick(n => n + 1);
    const onVisible = () => { if (document.visibilityState === 'visible') void actions.current.syncAudio(); };
    const media = ['playing', 'pause', 'ended'];
    for (const type of media) audio.addEventListener(type, rerender);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      for (const type of media) audio.removeEventListener(type, rerender);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [audio]);

  const lastPhase = useRef<TimerPhase | null>(null);
  useEffect(() => {
    const previous = lastPhase.current;
    lastPhase.current = status === 'running' ? phase : null;
    if (previous === null || previous === phase || phase === 'playing' || status !== 'running') return;
    if (document.visibilityState === 'visible') haptic('heavy');
  }, [phase, status]);

  const hasTimer = !!timer;
  useEffect(() => {
    const session = typeof navigator === 'undefined' ? undefined : navigator.mediaSession;
    if (!session || !soundOn || !hasTimer) return;
    const handle = (action: MediaSessionAction, fn: (() => void) | null) => { try { session.setActionHandler(action, fn); } catch { /* unsupported action */ } };
    try { if (typeof MediaMetadata === 'function') session.metadata = new MediaMetadata({ title: `Игра ${gameSequence} · таймер` }); } catch { /* no metadata */ }
    if (canControl) {
      handle('play', () => void actions.current.play());
      handle('pause', () => actions.current.pause());
    }
    return () => {
      session.metadata = null;
      if (canControl) { handle('play', null); handle('pause', null); }
    };
  }, [soundOn, hasTimer, gameSequence, canControl]);

  useEffect(() => () => {
    soundRef.current = false; // a track still being built must not start after leaving the screen
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }, [audio]);

  return {
    status, remainingSec, phase, durationSec, setDurationSec,
    sound, canControl, trackReady, start, pause, resume, reset, listen, mute,
  };
}
