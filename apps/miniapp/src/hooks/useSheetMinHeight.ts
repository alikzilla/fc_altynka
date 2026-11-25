import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * An open sheet never gets shorter. The largest natural height the sheet has had is kept in `--sheet-min` on the
 * dialog; CSS clamps it to the current max height (`min(var(--sheet-min), var(--sheet-max))`), so the keyboard or
 * a short screen still wins. A new `step` (the sheet deliberately turns into another screen) starts a fresh
 * measurement; closing forgets it, since the dialog is gone.
 */
export function useSheetMinHeight(dialog: RefObject<HTMLDialogElement | null>, step: string | number | undefined) {
  const remembered = useRef(0);

  const measure = useCallback(() => {
    const node = dialog.current;
    const content = node?.querySelector<HTMLElement>('.sheet-content');
    if (!node || !content) return;
    // Natural height: drag area, header and footer as they are, plus the content's full scroll height.
    const box = node.getBoundingClientRect().height;
    const natural = box - content.clientHeight + content.scrollHeight;
    // Content that scrolls means the sheet is capped (keyboard, short screen): the box is squeezed and
    // says nothing about the height the sheet wants. Wait until it fits again.
    if (natural > box || natural <= remembered.current) return;
    remembered.current = natural;
    node.style.setProperty('--sheet-min', `${natural}px`);
  }, [dialog]);

  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    remembered.current = 0;
    node.style.removeProperty('--sheet-min');
    measure();
  }, [dialog, measure, step]);

  useEffect(() => {
    const node = dialog.current;
    const content = node?.querySelector<HTMLElement>('.sheet-content');
    if (!node || typeof ResizeObserver === 'undefined') return;
    // The dialog changes size with the viewport and the footer; the content box with what is inside it.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (content) observer.observe(content);
    return () => {
      observer.disconnect();
      remembered.current = 0;
      node.style.removeProperty('--sheet-min');
    };
  }, [dialog, measure]);
}
