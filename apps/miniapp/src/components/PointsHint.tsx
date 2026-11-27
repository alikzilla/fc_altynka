import { useEffect, useRef, useState } from 'react';

/** How long the hint stays before closing by itself. */
const SHOW_MS = 4000;

/**
 * The 3/1/0 rule on demand: a small «i» in the table card's corner opens a bubble that closes by itself,
 * on any tap elsewhere, or on Escape.
 */
export function PointsHint() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setOpen(false), SHOW_MS);
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => { window.clearTimeout(timer); document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <span className="points-hint" ref={root}>
    <button type="button" className="points-hint-button" aria-label="Как считаются очки" aria-expanded={open} onClick={() => setOpen(o => !o)}>i</button>
    {open && <span className="points-hint-bubble" role="status">Победа — 3 очка, ничья — 1</span>}
  </span>;
}
