import type { ReactNode } from 'react';

/** One contextual next step, above the existing navigation dock. */
export function MatchAction({ children, label = 'Действие матча' }: { children: ReactNode; label?: string }) {
  return <div className="match-action" role="region" aria-label={label}>{children}</div>;
}
