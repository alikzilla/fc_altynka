import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

type Drag = {
  kind: 'touch' | 'pointer'; id: number; x: number; y: number;
  active: boolean; distance: number; samples: { y: number; time: number }[];
};

/** Native scrolling in the form; one owned gesture for pulling the sheet down. */
export function useBottomSheet(dialog: RefObject<HTMLDialogElement | null>, onDismiss: () => void, locked: RefObject<boolean>) {
  const callback = useRef(onDismiss);
  callback.current = onDismiss;
  const dismissing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drag = useRef<Drag | null>(null);
  const [closing, setClosing] = useState(false);

  const dismiss = useCallback(() => {
    if (locked.current || dismissing.current) return;
    dismissing.current = true;
    setClosing(true);
    const node = dialog.current;
    if (!node || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { callback.current(); return; }
    node.getBoundingClientRect(); // Start the exit from the current drag position.
    node.removeAttribute('data-dragging');
    node.dataset.closing = 'true';
    node.style.setProperty('--sheet-y', `${node.offsetHeight + 32}px`);
    timer.current = setTimeout(() => callback.current(), 180);
  }, [dialog, locked]);

  useEffect(() => {
    const node = dialog.current!;
    const content = () => node.querySelector<HTMLElement>('.sheet-content');
    const release = () => {
      const current = drag.current;
      drag.current = null;
      if (current?.kind === 'pointer' && node.hasPointerCapture?.(current.id)) node.releasePointerCapture(current.id);
    };
    const reset = () => {
      release();
      if (dismissing.current) return;
      node.removeAttribute('data-dragging');
      node.style.setProperty('--sheet-y', '0px');
    };
    const begin = (kind: Drag['kind'], id: number, x: number, y: number, target: EventTarget | null) => {
      if (locked.current || dismissing.current || drag.current || !(target instanceof Element)) return;
      if (target.closest('button, input, textarea, select, a')) return;
      const header = target.closest('.sheet-drag-area, .sheet-heading');
      if (!header && (kind === 'pointer' || !target.closest('.sheet-content') || (content()?.scrollTop ?? 0) > 0)) return;
      node.dataset.interacted = 'true';
      drag.current = { kind, id, x, y, active: false, distance: 0, samples: [{ y, time: performance.now() }] };
    };
    const move = (x: number, y: number, event: Event) => {
      const current = drag.current;
      if (!current) return;
      if (locked.current) { reset(); return; }
      const dx = x - current.x;
      const dy = y - current.y;
      if (!current.active) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        if (dy <= 0 || dy < Math.abs(dx) * 1.2) { reset(); return; }
        current.active = true;
        node.dataset.dragging = 'true';
        if (current.kind === 'pointer') node.setPointerCapture(current.id);
      }
      if (event.cancelable) event.preventDefault();
      current.distance = Math.max(0, dy);
      const now = performance.now();
      current.samples.push({ y, time: now });
      current.samples = current.samples.filter(sample => now - sample.time <= 100);
      node.style.setProperty('--sheet-y', `${current.distance}px`);
    };
    const end = () => {
      const current = drag.current;
      if (!current) return;
      const first = current.samples[0];
      const last = current.samples.at(-1)!;
      const speed = first ? (last.y - first.y) / Math.max(1, performance.now() - first.time) : 0;
      const shouldDismiss = current.active && (current.distance >= Math.min(140, node.offsetHeight * .22) || current.distance > 48 && speed > .65);
      if (shouldDismiss && !locked.current) { dismiss(); release(); }
      else reset();
    };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { reset(); return; }
      const point = event.touches[0];
      begin('touch', point.identifier, point.clientX, point.clientY, event.target);
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) { reset(); return; }
      const point = event.touches[0];
      if (drag.current?.kind === 'touch' && drag.current.id === point.identifier) move(point.clientX, point.clientY, event);
    };
    const touchEnd = () => { if (drag.current?.kind === 'touch') end(); };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary) return;
      begin('pointer', event.pointerId, event.clientX, event.clientY, event.target);
    };
    const pointerMove = (event: PointerEvent) => {
      if (drag.current?.kind === 'pointer' && drag.current.id === event.pointerId) move(event.clientX, event.clientY, event);
    };
    const pointerEnd = (event: PointerEvent) => { if (drag.current?.kind === 'pointer' && drag.current.id === event.pointerId) end(); };
    const pointerCancel = (event: PointerEvent) => { if (drag.current?.kind === 'pointer' && drag.current.id === event.pointerId) reset(); };
    const viewport = () => {
      const visual = window.visualViewport;
      node.style.setProperty('--sheet-viewport', `${visual?.height ?? window.innerHeight}px`);
      node.style.setProperty('--sheet-bottom', `${visual ? Math.max(0, window.innerHeight - visual.height - visual.offsetTop) : 0}px`);
    };
    node.addEventListener('touchstart', touchStart, { passive: true });
    node.addEventListener('touchmove', touchMove, { passive: false });
    node.addEventListener('touchend', touchEnd);
    node.addEventListener('touchcancel', reset);
    node.addEventListener('pointerdown', pointerDown);
    node.addEventListener('pointermove', pointerMove);
    node.addEventListener('pointerup', pointerEnd);
    node.addEventListener('pointercancel', pointerCancel);
    node.addEventListener('lostpointercapture', pointerCancel);
    window.addEventListener('blur', reset);
    window.visualViewport?.addEventListener('resize', viewport);
    window.visualViewport?.addEventListener('scroll', viewport);
    window.addEventListener('resize', viewport);
    viewport();
    return () => {
      clearTimeout(timer.current);
      release();
      node.removeEventListener('touchstart', touchStart);
      node.removeEventListener('touchmove', touchMove);
      node.removeEventListener('touchend', touchEnd);
      node.removeEventListener('touchcancel', reset);
      node.removeEventListener('pointerdown', pointerDown);
      node.removeEventListener('pointermove', pointerMove);
      node.removeEventListener('pointerup', pointerEnd);
      node.removeEventListener('pointercancel', pointerCancel);
      node.removeEventListener('lostpointercapture', pointerCancel);
      window.removeEventListener('blur', reset);
      window.visualViewport?.removeEventListener('resize', viewport);
      window.visualViewport?.removeEventListener('scroll', viewport);
      window.removeEventListener('resize', viewport);
    };
  }, [dialog, dismiss, locked]);
  return { dismiss, closing };
}
