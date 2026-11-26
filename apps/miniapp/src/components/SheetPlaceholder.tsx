import type { ReactNode } from 'react';

/**
 * Holds the place of sheet content that appears after an action. The real content is drawn invisibly
 * in the same grid cell, so the placeholder has exactly its size; the dashed frame and the hint sit on top.
 * The hint is ordinary text; the invisible copy is hidden from screen readers and focus.
 * Without a hint the place stays reserved and empty: for states where no action would make the content appear.
 */
export function SheetPlaceholder({ hint, children, className = '' }: { hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`sheet-placeholder ${className}`.trim()}>
      <div className="sheet-placeholder-ghost" aria-hidden="true" inert>{children}</div>
      {hint && <p className="sheet-placeholder-hint">{hint}</p>}
    </div>
  );
}
