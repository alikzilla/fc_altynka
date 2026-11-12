const KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * Focus rings are for people moving with a keyboard (Telegram Desktop and Web). On a phone a ring left behind by a
 * tap, or by focus returning to a button after a sheet closes, looks like a stuck border, so touch and mouse hide it.
 * Typing on a screen keyboard does not count: only navigation keys switch the rings on.
 */
export function trackInputMode(): () => void {
  const root = document.documentElement;
  const keyboard = (event: KeyboardEvent) => { if (KEYS.has(event.key)) root.dataset.input = 'keyboard'; };
  const pointer = () => { delete root.dataset.input; };
  window.addEventListener('keydown', keyboard, true);
  window.addEventListener('pointerdown', pointer, true);
  return () => { window.removeEventListener('keydown', keyboard, true); window.removeEventListener('pointerdown', pointer, true); };
}
