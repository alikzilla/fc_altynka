import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeWav, layoutTrack, mixTrack, TRACK_TAIL_SEC, type ClipName } from '../src/lib/timerTrack';

const NAMES: ClipName[] = ['beep', 'minute', 'attack', 'whistle', 'time'];

describe('layoutTrack', () => {
  it('раскладывает сигналы и голос по меткам таймера', () => {
    expect(layoutTrack(360)).toEqual([
      { clip: 'beep', atMs: 0 },
      { clip: 'beep', atMs: 300000 },
      { clip: 'beep', atMs: 300300 },
      { clip: 'minute', atMs: 300700 },
      { clip: 'beep', atMs: 345000 },
      { clip: 'beep', atMs: 345250 },
      { clip: 'beep', atMs: 345500 },
      { clip: 'attack', atMs: 345900 },
      { clip: 'whistle', atMs: 360000 },
      { clip: 'time', atMs: 361800 },
    ]);
  });
});

describe('mixTrack', () => {
  const ones = () => Object.fromEntries(NAMES.map(n => [n, new Float32Array(10).fill(1)])) as Record<ClipName, Float32Array>;

  it('ставит клипы по времени и добавляет хвост', () => {
    const out = mixTrack(240, ones(), 1000);
    expect(out.length).toBe((240 + TRACK_TAIL_SEC) * 1000);
    expect(out[0]).toBe(1);
    expect(out[180000]).toBe(1);
    expect(out[100]).toBe(0);
  });

  it('не выходит за [-1, 1] при наложении клипов', () => {
    const clips = ones();
    clips.beep = new Float32Array(1000).fill(1);
    const out = mixTrack(240, clips, 1000);
    // длинный beep@180000 накладывается на beep@180300 и minute@180700: сумма 3, после клэмпа 1
    expect(out[180700]).toBe(1);
    expect(out.every(v => v >= -1 && v <= 1)).toBe(true);
  });
});

describe('encodeWav', () => {
  it('пишет стандартный 16-бит PCM моно заголовок', async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1]), 16000);
    expect(blob.size).toBe(44 + 6);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(...new Uint8Array(buf, o, 4));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([0, 32767, -32768]);
  });
});

describe('buildTrack', () => {
  type Module = typeof import('../src/lib/timerTrack');
  let lib: Module;
  let created: string[];
  let revoked: string[];
  let fetchMock: ReturnType<typeof vi.fn>;
  const audioReply = () => new Response(new ArrayBuffer(8), { headers: { 'content-type': 'audio/mpeg' } });

  beforeEach(async () => {
    vi.resetModules();
    lib = await import('../src/lib/timerTrack');
    created = []; revoked = [];
    let n = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { const url = `blob:t${++n}`; created.push(url); return url; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => { revoked.push(url); });
    fetchMock = vi.fn(async () => audioReply());
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('OfflineAudioContext', class {
      decodeAudioData = async () => ({ getChannelData: () => new Float32Array(4) });
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('декодирует клипы один раз за сессию и держит готовым только трек текущей длительности', async () => {
    const first = await lib.buildTrack(240);
    expect(lib.readyTrack(240)).toBe(first);
    expect(await lib.buildTrack(240)).toBe(first);
    const second = await lib.buildTrack(300);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(lib.readyTrack(300)).toBe(second);
    expect(lib.readyTrack(240)).toBeNull();
    // Старый трек ещё стоит на элементе: его не отзывают, пока его не сменят.
    lib.releaseTracks(first!);
    expect(revoked).toEqual([]);
    lib.releaseTracks(second!);
    expect(revoked).toEqual([first]);
    lib.releaseTracks('');
    expect(revoked).toEqual([first]);
  });

  it('трек, который перебил новый, не остаётся в памяти', async () => {
    const stale = lib.buildTrack(240);
    const fresh = lib.buildTrack(300);
    await Promise.all([stale, fresh]);
    lib.releaseTracks(lib.readyTrack(300)!);
    expect(created.filter(url => !revoked.includes(url))).toEqual([lib.readyTrack(300)]);
  });

  it('если вместо звука пришла страница, сборка падает, а следующая попытка снова скачивает клипы', async () => {
    fetchMock.mockImplementation(async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }));
    await expect(lib.buildTrack(360)).rejects.toThrow();
    expect(lib.readyTrack(360)).toBeNull();
    fetchMock.mockImplementation(async () => audioReply());
    const calls = fetchMock.mock.calls.length;
    await expect(lib.buildTrack(360)).resolves.toMatch(/^blob:/);
    expect(fetchMock.mock.calls.length).toBe(calls + 5);
    expect(lib.readyTrack(360)).not.toBeNull();
  });
});
