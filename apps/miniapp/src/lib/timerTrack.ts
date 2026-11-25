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
const tracks = new Map<number, Promise<string>>();

async function loadClips(): Promise<Record<ClipName, Float32Array>> {
  const ctx = new OfflineAudioContext(1, 1, TRACK_SAMPLE_RATE);
  const decoded = await Promise.all(CLIP_NAMES.map(async name => {
    const res = await fetch(`/sounds/${name}.mp3`);
    if (!res.ok) throw new Error(`sound ${name}: ${res.status}`);
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    return buffer.getChannelData(0);
  }));
  return Object.fromEntries(CLIP_NAMES.map((name, i) => [name, decoded[i]])) as Record<ClipName, Float32Array>;
}

/** Object URL готового WAV-трека; кэшируется по длительности на сессию. */
export function buildTrack(durationSec: number): Promise<string> {
  let track = tracks.get(durationSec);
  if (!track) {
    track = loadClips()
      .then(clips => URL.createObjectURL(encodeWav(mixTrack(durationSec, clips, TRACK_SAMPLE_RATE), TRACK_SAMPLE_RATE)))
      .catch(error => { tracks.delete(durationSec); throw error; });
    tracks.set(durationSec, track);
  }
  return track;
}
