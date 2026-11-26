import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * An open sheet never gets shorter. The largest height the sheet has had (its natural height, or the box while it is
 * capped) is kept in `--sheet-min` on the dialog; CSS clamps it to the current max height
 * (`min(var(--sheet-min), var(--sheet-max))`), so the keyboard or a short screen still wins. A new `step` (the sheet deliberately turns into another screen) starts a fresh
 * measurement; closing forgets it, since the dialog is gone.
 */
export function useSheetMinHeight(dialog: RefObject<HTMLDialogElement | null>, step: string | number | undefined) {
  const remembered = useRef(0);

  const measure = useCallback(() => {
    const node = dialog.current;
    const content = node?.querySelector<HTMLElement>('.sheet-content');
    if (!node || !content) return;
    // Natural height: drag area, header and footer as they are, plus the content's full scroll height. The keyboard
    // padding at the bottom (its current, possibly animated value) is not content: the sheet only extends under
    // the keys, so it is left out, or opening the keyboard would raise the remembered height.
    const box = node.getBoundingClientRect().height - (parseFloat(getComputedStyle(node).paddingBottom) || 0);
    const natural = box - content.clientHeight + content.scrollHeight;
    // Content that scrolls means the sheet is capped (keyboard, short screen, long list): the natural height is
    // more than fits, so keep the box itself. Under the keyboard the squeezed box is below what is remembered and
    // never lowers it; a long list that hits the cap keeps the sheet at the cap when the list gets shorter.
    const height = Math.min(natural, box);
    if (height <= remembered.current) return;
    remembered.current = height;
    node.style.setProperty('--sheet-min', `${height}px`);
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
