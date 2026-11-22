import type { TeamColor } from '@altynka/core';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { haptic } from '../lib/tg';

export type CoinFace = { key: TeamColor; name: string };
type Props = {
  faces: CoinFace[];
  /** Index into `faces` once the server answered; `null` while waiting or before the toss. */
  result: number | null;
  /** The server refused; the coin falls back and can be tossed again. */
  failed?: boolean;
  disabled?: boolean;
  onToss: () => void;
  /** Called once the coin rests on the server's answer. */
  onLanded?: () => void;
};

const MIN_FLIGHT = 1100;
const LANDING = 950;

/** Club token styled after the bimetal 200 tenge coin: silver ring, gold centre, 16 edge notches. Never a copy of real money. */
export function TossCoin({ faces, result, failed = false, disabled = false, onToss, onLanded }: Props) {
  const [face, setFace] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'flying' | 'landed'>('idle');
  const wrap = useRef<HTMLSpanElement>(null);
  const coin = useRef<HTMLSpanElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const ring = useRef<SVGTextElement>(null);
  const ringPath = useRef<SVGPathElement>(null);
  const flight = useRef<{ start: number; power: number; halfTurns: number; frame: number; landing: { from: number; to: number; at: number; y: number } | null } | null>(null);
  const latest = useRef({ result, failed, onLanded });
  latest.current = { result, failed, onLanded };
  const down = useRef<{ y: number; t: number } | null>(null);
  /** Guards a second toss before React re-renders the new phase. */
  const busy = useRef(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Spread the ring lettering over the whole circumference so the seam has no gap. The coin mounts inside a
  // sheet that is not on screen yet, where text measures zero: fit it once the ring has a size, and again
  // when the font has loaded.
  useLayoutEffect(() => {
    const text = ring.current, path = ringPath.current;
    if (!text || !path || typeof text.getComputedTextLength !== 'function' || typeof path.getTotalLength !== 'function') return;
    let live = true;
    const fit = () => {
      if (!live) return false;
      text.style.letterSpacing = '0px';
      const length = text.getComputedTextLength();
      const chars = text.textContent?.length ?? 0;
      if (length <= 0 || !chars) return false;
      text.style.letterSpacing = `${(path.getTotalLength() - length) / chars}px`;
      return true;
    };
    void document.fonts?.ready.then(fit);
    const svg = text.ownerSVGElement;
    const observer = !fit() && svg && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (fit()) observer?.disconnect(); }) : null;
    if (svg) observer?.observe(svg);
    return () => { live = false; observer?.disconnect(); };
  }, []);

  useEffect(() => () => { if (flight.current) cancelAnimationFrame(flight.current.frame); }, []);

  // Reduced motion: no flight, the answer appears in place.
  useEffect(() => {
    if (!reduced || phase !== 'flying') return;
    if (result !== null) { setFace(result); setPhase('landed'); haptic('heavy'); onLanded?.(); }
    else if (failed) { setPhase('idle'); busy.current = false; }
  }, [reduced, phase, result, failed, onLanded]);

  function reset() {
    for (const el of [wrap.current, coin.current, shadow.current]) if (el) { el.style.transform = ''; el.style.filter = ''; el.style.opacity = ''; }
  }

  function step(now: number) {
    const f = flight.current;
    if (!f) return;
    const n = faces.length;
    const t = now - f.start;
    const height = 200 + f.power * 50;
    let y: number, angle: number;
    if (!f.landing) {
      // Rise, then hang near the top spinning steadily until the server answers.
      const rise = Math.min(t / 380, 1);
      y = -height * (1 - (1 - rise) ** 2) + Math.sin(t / 260) * 6 * rise;
      angle = (t / 1000) * Math.PI * (7 + f.power * 2);
      const { result: answer, failed: refused } = latest.current;
      if (t >= MIN_FLIGHT && (answer !== null || refused)) {
        const current = Math.floor((angle + Math.PI / 2) / Math.PI);
        let target = current + 3;
        if (answer !== null) while (target % n !== answer) target++;
        f.landing = { from: angle, to: target * Math.PI, at: now, y };
      }
    } else {
      const p = Math.min((now - f.landing.at) / LANDING, 1);
      angle = f.landing.from + (f.landing.to - f.landing.from) * (1 - (1 - p) ** 3);
      y = f.landing.y * (1 - p * p);
      if (p >= 1) {
        flight.current = null; reset();
        if (latest.current.result !== null) {
          setFace(latest.current.result); setPhase('landed'); haptic('heavy'); latest.current.onLanded?.();
          wrap.current?.animate?.([{ transform: 'scale(1.08,.9)' }, { transform: 'scale(.97,1.03)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.23,1,.32,1)' });
        } else { setFace(0); setPhase('idle'); busy.current = false; }
        return;
      }
    }
    const half = Math.floor((angle + Math.PI / 2) / Math.PI);
    if (half !== f.halfTurns) { f.halfTurns = half; setFace(half % n); haptic('light'); }
    const c = Math.cos(angle);
    if (wrap.current) wrap.current.style.transform = `translateY(${y}px) scale(${1 + (-y / height) * 0.18})`;
    if (coin.current) {
      coin.current.style.transform = `scaleY(${Math.max(Math.abs(c), 0.07)}) rotate(${Math.sin(angle * 0.5) * 6}deg)`;
      coin.current.style.filter = `brightness(${0.62 + 0.38 * Math.abs(c)})`;
    }
    if (shadow.current) { const g = 1 + (y / height) * 0.75; shadow.current.style.transform = `scale(${g})`; shadow.current.style.opacity = String(0.35 + 0.65 * g); }
    f.frame = requestAnimationFrame(step);
  }

  function toss(power = 1) {
    if (disabled || phase !== 'idle' || busy.current) return;
    busy.current = true;
    setPhase('flying');
    onToss();
    if (reduced) return;
    flight.current = { start: performance.now(), power, halfTurns: 0, frame: 0, landing: null };
    flight.current.frame = requestAnimationFrame(step);
  }

  function pointerDown(e: PointerEvent) { down.current = { y: e.clientY, t: performance.now() }; }
  function pointerUp(e: PointerEvent) {
    const start = down.current; down.current = null;
    if (!start) return;
    const dy = start.y - e.clientY;
    toss(dy > 20 ? Math.min(1.6, 0.8 + dy / Math.max(performance.now() - start.t, 1)) : 1);
  }

  const shown = faces[face] ?? faces[0];
  return <div className={`toss-zone ${phase}`}>
    <button type="button" className="toss-coin" aria-label={phase === 'landed' ? `Монета: ${shown.name}` : 'Подбросить монету'} disabled={disabled || phase !== 'idle'}
      onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { down.current = null; }}
      onClick={e => { if (e.detail === 0) toss(1); }}>
      <span className="toss-shadow" ref={shadow} aria-hidden="true" />
      <span className="coin-wrap" ref={wrap} aria-hidden="true">
        <span className="coin" ref={coin}>
          <span className="coin-edge" />
          <span className="coin-face">
            <svg className="coin-ring" viewBox="0 0 170 170"><defs><path id="coin-ring-path" ref={ringPath} d="M85,85 m-71,0 a71,71 0 1,1 142,0 a71,71 0 1,1 -142,0" /></defs><text ref={ring} dy="4"><textPath href="#coin-ring-path">ФК АЛТЫНКА • 2026 • ФК АЛТЫНКА • 2026 • </textPath></text></svg>
            <span className={`coin-centre team-${shown.key}`}><span className="coin-enamel" /><b>{shown.name}</b></span>
          </span>
        </span>
      </span>
    </button>
    <p className="toss-hint" aria-hidden={phase !== 'idle'}>{phase === 'idle' ? <><span className="toss-arrow" aria-hidden="true">↑</span>Подбрось монету</> : ' '}</p>
  </div>;
}
