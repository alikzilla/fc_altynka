import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * One contextual next step, fixed at the bottom of a deeper screen, where the tabs keep their dock.
 *
 * The action is declared wherever its logic lives (inside the summary card, a tab panel), but those
 * hosts form their own stacking contexts, so later cards and tables would paint over the fixed button.
 * It is therefore mounted as a direct child of the screen, where its z-index is compared with the whole
 * page. Inside a form or the current-game card it stays in place: there it is part of the flow.
 */
export function MatchAction({ children, label = 'Действие матча' }: { children: ReactNode; label?: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<Element | null | undefined>(undefined);
  useLayoutEffect(() => {
    const node = anchor.current;
    setHost(node && !node.closest('form, .game-current') ? node.closest('.screen') : null);
  }, []);
  if (host === undefined) return <span ref={anchor} hidden />;
  const action = <div className="match-action" role="region" aria-label={label}>{children}</div>;
  return host ? createPortal(action, host) : action;
}
