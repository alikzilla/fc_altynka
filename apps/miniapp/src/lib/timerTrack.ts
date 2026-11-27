import { timerCues } from '@altynka/core';

// Трек таймера собирается в браузере из коротких клипов: сигналы зашиты в звук,
// поэтому играют и при заблокированном экране.
export type ClipName = 'beep' | 'minute' | 'attack' | 'whistle' | 'time';

export const TRACK_SAMPLE_RATE = 16000;
export const TRACK_TAIL_SEC = 4;

export function layoutTrack(durationSec: number): { clip: ClipName; atMs: number }[] {
  const out: { clip: ClipName; atMs: number }[] = [];
  for (const { atSec, kind } of timerCues(durationSec)) {
    const at = atSec * 1000;
    if (kind === 'start') out.push({ clip: 'beep', atMs: at });
    else if (kind === 'last_minute') out.push({ clip: 'beep', atMs: at }, { clip: 'beep', atMs: at + 300 }, { clip: 'minute', atMs: at + 700 });
    else if (kind === 'last_attack') out.push({ clip: 'beep', atMs: at }, { clip: 'beep', atMs: at + 250 }, { clip: 'beep', atMs: at + 500 }, { clip: 'attack', atMs: at + 900 });
    else out.push({ clip: 'whistle', atMs: at }, { clip: 'time', atMs: at + 1800 });
  }
  return out;
}

export function mixTrack(durationSec: number, clips: Record<ClipName, Float32Array>, sampleRate: number): Float32Array {
  const out = new Float32Array(Math.round((durationSec + TRACK_TAIL_SEC) * sampleRate));
  for (const { clip, atMs } of layoutTrack(durationSec)) {
    const start = Math.round((atMs * sampleRate) / 1000);
    const data = clips[clip];
    const end = Math.min(out.length, start + data.length);
    for (let i = start; i < end; i++) out[i] += data[i - start];
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = samples.length * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const text = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // моно
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, bytes, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 32768 : v * 32767, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}

const CLIP_NAMES: ClipName[] = ['beep', 'minute', 'attack', 'whistle', 'time'];
type Clips = Record<ClipName, Float32Array>;

async function decodeClips(): Promise<Clips> {
  const ctx = new OfflineAudioContext(1, 1, TRACK_SAMPLE_RATE);
  const decoded = await Promise.all(CLIP_NAMES.map(async name => {
    const res = await fetch(`/sounds/${name}.mp3`);
    // A missing file is answered by the SPA fallback with 200 and the HTML page.
    if (!res.ok || !res.headers.get('content-type')?.startsWith('audio/')) throw new Error(`sound ${name}: ${res.status}`);
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    return buffer.getChannelData(0);
  }));
  return Object.fromEntries(CLIP_NAMES.map((name, i) => [name, decoded[i]])) as Clips;
}

// Clips are decoded once per session; a failed attempt is forgotten, so the next one downloads them again.
let clips: Promise<Clips> | null = null;
function loadClips(): Promise<Clips> {
  clips ??= decodeClips().catch(error => { clips = null; throw error; });
  return clips;
}

// Only the latest duration's track is kept: a WAV of 10 minutes is about 19 MB.
interface Track { durationSec: number; url: string | null; built: Promise<string | null> }
let latest: Track | null = null;
const retired = new Set<string>();

/**
 * Builds the WAV track of a duration and keeps it as the current one; the previous duration's track is retired
 * and revoked by `releaseTracks`. Resolves to the object URL, or null when another duration superseded it.
 */
export function buildTrack(durationSec: number): Promise<string | null> {
  if (latest?.durationSec === durationSec) return latest.built;
  if (latest?.url) retired.add(latest.url);
  const track: Track = { durationSec, url: null, built: Promise.resolve(null) };
  track.built = loadClips().then(
    loaded => {
      if (latest !== track) return null;
      track.url = URL.createObjectURL(encodeWav(mixTrack(durationSec, loaded, TRACK_SAMPLE_RATE), TRACK_SAMPLE_RATE));
      return track.url;
    },
    error => { if (latest === track) latest = null; throw error; },
  );
  latest = track;
  return track.built;
}

/** Object URL of the built track of this duration, or null while it is not ready. */
export function readyTrack(durationSec: number): string | null {
  return latest?.durationSec === durationSec ? latest.url : null;
}

/** Revokes the tracks of other durations, except the one still set on the audio element. */
export function releaseTracks(inUse: string): void {
  for (const url of retired) {
    if (url === inUse) continue;
    URL.revokeObjectURL(url);
    retired.delete(url);
  }
}
