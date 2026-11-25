import type { ReactNode } from 'react';

/**
 * Holds the place of sheet content that appears after an action. The real content is drawn invisibly
 * in the same grid cell, so the placeholder has exactly its size; the dashed frame and the hint sit on top.
 * The hint is ordinary text; the invisible copy is hidden from screen readers and focus.
 */
export function SheetPlaceholder({ hint, children, className = '' }: { hint: string; children: ReactNode; className?: string }) {
  return (
    <div className={`sheet-placeholder ${className}`.trim()}>
      <div className="sheet-placeholder-ghost" aria-hidden="true" inert>{children}</div>
      <p className="sheet-placeholder-hint">{hint}</p>
    </div>
  );
}
