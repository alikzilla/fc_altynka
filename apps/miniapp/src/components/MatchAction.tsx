import type { ReactNode } from 'react';

/** One contextual next step, above the existing navigation dock. */
export function MatchAction({ children }: { children: ReactNode }) {
  return <div className="match-action" role="region" aria-label="Действие матча">{children}</div>;
}
