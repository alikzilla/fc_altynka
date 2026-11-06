import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBackButton } from '../lib/tg';
import { useBottomSheet } from '../hooks/useBottomSheet';
import { EdgeBackGesture } from './EdgeBackGesture';
import { Icon } from './Icon';

const openSheets = new Set<HTMLDialogElement>();
let previousOverflow = '';

export function ActionSheet({ title, onClose, busy = false, children, footer, className = '' }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode; footer?: ReactNode; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(busy);
  locked.current = busy;
  const backdrop = useRef(false);
  const titleId = useId();
  const { dismiss, closing } = useBottomSheet(dialog, onClose, locked);
  useBackButton(dismiss);
  useEffect(() => {
    const node = dialog.current!;
    const focus = document.activeElement as HTMLElement | null;
    if (openSheets.size === 0) previousOverflow = document.body.style.overflow;
    openSheets.add(node);
    node.showModal();
    node.querySelector<HTMLElement>('h2')?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      node.close(); openSheets.delete(node);
      if (openSheets.size === 0) document.body.style.overflow = previousOverflow;
      if (focus?.isConnected) focus.focus();
    };
  }, []);
  return createPortal(<dialog ref={dialog} className={`create-sheet action-sheet ${className}`} aria-labelledby={titleId} aria-modal="true" aria-busy={busy} onCancel={e => { e.preventDefault(); dismiss(); }} onKeyDown={e => {
    if (e.key !== 'Tab') return;
    const collapsed = [...e.currentTarget.querySelectorAll('details:not([open])')];
    const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]:not([aria-disabled="true"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary')].filter(control => control.getClientRects().length > 0 && collapsed.every(details => !details.contains(control) || details.querySelector(':scope > summary')?.contains(control)));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) { e.preventDefault(); e.currentTarget.querySelector<HTMLElement>('h2')?.focus(); }
    else if (e.shiftKey && (document.activeElement === first || document.activeElement?.id === titleId)) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }} onPointerDown={e => {
    const box = e.currentTarget.getBoundingClientRect();
    backdrop.current = e.target === e.currentTarget && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom);
  }} onClick={e => {
    if (e.target !== e.currentTarget || !backdrop.current) return;
    backdrop.current = false;
    const box = e.currentTarget.getBoundingClientRect();
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) dismiss();
  }}>
    <EdgeBackGesture onBack={dismiss} disabled={busy || closing} />
    <div className="sheet-drag-area" aria-hidden="true"><span /></div>
    <header className="sheet-heading"><h2 id={titleId} tabIndex={-1}>{title}</h2><button className="sheet-close" aria-label="Закрыть" type="button" onClick={dismiss} disabled={busy || closing}><Icon name="close" /></button></header>
    <div className="sheet-content">{children}</div>
    {footer && <footer className="sheet-footer">{footer}</footer>}
  </dialog>, document.body);
}
