import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { getBackAction, haptic } from '../lib/tg';

type Drag = {
  id: number; x: number; y: number; direction: 1 | -1;
  active: boolean; distance: number; threshold: number;
  samples: { x: number; time: number }[];
};

/** An inward pull from either edge invokes the same owner as Telegram Back. */
export function EdgeBackGesture({ onBack, disabled = false }: { onBack: (() => void) | null; disabled?: boolean }) {
  const indicator = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cue = indicator.current;
    // The cue sits in a clipping layer over the screen or sheet; the gesture's scope is what the layer covers.
    const scope = cue?.parentElement?.parentElement;
    if (!cue || !scope || !onBack || disabled) return;
    let drag: Drag | null = null;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const reset = () => {
      // The non-passive move listener lives only while an edge pull is in progress, so ordinary
      // scrolling never waits for the main thread.
      document.removeEventListener('touchmove', move);
      drag = null;
      cue.removeAttribute('data-active');
      cue.removeAttribute('data-ready');
    };

    const start = (event: TouchEvent) => {
      reset();
      if (event.touches.length !== 1 || getBackAction() !== onBack) return;
      const target = event.target;
      if (!(target instanceof Element) || !scope.contains(target)) return;
      // These controls own text selection, horizontal scrolling, or their own gestures.
      if (target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="tablist"], .match-carousel, [data-edge-back-ignore]')) return;
      if (scope.querySelector('[aria-busy="true"]')) return;
      const touch = event.touches[0]!;
      const box = scope.getBoundingClientRect();
      const left = Math.max(0, box.left);
      const right = Math.min(window.innerWidth, box.right);
      if (touch.clientY < box.top || touch.clientY > box.bottom || touch.clientX < left || touch.clientX > right) return;
      const direction = touch.clientX - left <= 24 ? 1 : right - touch.clientX <= 24 ? -1 : null;
      if (!direction) return;
      drag = {
        id: touch.identifier, x: touch.clientX, y: touch.clientY, direction,
        active: false, distance: 0, threshold: Math.min(112, Math.max(64, (right - left) * .23)),
        samples: [{ x: touch.clientX, time: performance.now() }],
      };
      cue.dataset.side = direction === 1 ? 'left' : 'right';
      cue.style.left = `${(direction === 1 ? left : right) - box.left}px`;
      cue.style.top = `${Math.max(64, Math.min(window.innerHeight - 96, touch.clientY)) - box.top}px`;
      document.addEventListener('touchmove', move, { passive: false });
    };

    const move = (event: TouchEvent) => {
      if (!drag) return;
      if (event.touches.length !== 1 || getBackAction() !== onBack) { reset(); return; }
      const touch = event.touches[0]!;
      if (touch.identifier !== drag.id) { reset(); return; }
      const distance = (touch.clientX - drag.x) * drag.direction;
      const vertical = Math.abs(touch.clientY - drag.y);
      if (!drag.active) {
        if (Math.max(Math.abs(distance), vertical) < 10) return;
        if (distance <= 0 || distance < vertical * 1.3) { reset(); return; }
        drag.active = true;
      }
      if (!event.cancelable) { reset(); return; }
      event.preventDefault();
      drag.distance = Math.max(0, distance);
      const time = performance.now();
      drag.samples.push({ x: touch.clientX, time });
      drag.samples = drag.samples.filter(sample => time - sample.time <= 100);
      const travel = reducedMotion ? 24 : Math.min(96, distance <= 64 ? Math.max(0, distance) : 64 + (distance - 64) * .12);
      cue.style.setProperty('--edge-offset', `${drag.direction * travel}px`);
      cue.dataset.active = '';
      cue.toggleAttribute('data-ready', drag.distance >= drag.threshold);
    };

    const end = (event: TouchEvent) => {
      const current = drag;
      if (!current || event.touches.length) { reset(); return; }
      const last = current.samples.at(-1)!;
      const first = current.samples[0]!;
      const velocity = performance.now() - last.time > 100 ? 0 : (last.x - first.x) * current.direction / Math.max(1, last.time - first.time);
      const commit = current.active && getBackAction() === onBack && velocity >= -.15
        && (current.distance >= current.threshold || current.distance >= 36 && velocity >= .55);
      reset();
      if (commit) { haptic('light'); onBack(); }
    };

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
    window.addEventListener('blur', reset);
    window.addEventListener('resize', reset);
    return () => {
      reset();
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', reset);
      window.removeEventListener('blur', reset);
      window.removeEventListener('resize', reset);
    };
  }, [onBack, disabled]);

  // The cue starts half beyond the edge it was pulled from. The layer clips it there, so a pull from the right
  // edge cannot widen the page into a horizontal scroll.
  return onBack ? <div className="edge-back-layer" aria-hidden="true"><div ref={indicator} className="edge-back-cue"><Icon name="back" /></div></div> : null;
}
