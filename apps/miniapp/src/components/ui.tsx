import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Icon } from './Icon';
import { useBackButton } from '../lib/tg';
import { EdgeBackGesture } from './EdgeBackGesture';

type ToastOptions = { action?: { label: string; onClick: () => void }; tone?: 'error' };
const ToastCtx = createContext<(text: string | null, options?: ToastOptions) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<({ text: string } & ToastOptions) | null>(null);
  const toast = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const remaining = useRef(0);
  const deadline = useRef(0);
  const show = useCallback((text: string | null, options?: ToastOptions) => {
    clearTimeout(timer.current);
    timer.current = undefined;
    setNotification(text ? { text, ...options } : null);
    if (!text) return;
    remaining.current = options?.action ? 8000 : options?.tone === 'error' ? 6000 : 2500;
    deadline.current = Date.now() + remaining.current;
    timer.current = setTimeout(() => setNotification(null), remaining.current);
  }, []);
  const pause = () => {
    if (timer.current === undefined) return;
    remaining.current = Math.max(0, deadline.current - Date.now());
    clearTimeout(timer.current); timer.current = undefined;
  };
  const resume = () => {
    const node = toast.current;
    if (!node || node.matches(':hover') || node.contains(document.activeElement)) return;
    clearTimeout(timer.current);
    deadline.current = Date.now() + remaining.current;
    timer.current = setTimeout(() => setNotification(null), remaining.current);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const node = toast.current;
    if (!notification || !node?.showPopover) return;
    // A manual popover paints above native dialogs without taking their focus.
    node.showPopover();
    return () => { if (node.matches(':popover-open')) node.hidePopover(); };
  }, [notification]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {/* Live regions stay mounted: screen readers skip a region that arrives already filled. */}
      {([false, true] as const).map(urgent => <div key={String(urgent)} className="toast-region" {...urgent ? { 'aria-live': 'assertive' as const, 'aria-atomic': true } : { role: 'status' }}>
        {notification && (notification.tone === 'error') === urgent && (
          <div ref={toast} className={`toast${notification.action ? ' toast-with-action' : ''}${notification.tone === 'error' ? ' toast-error' : ''}`} popover="manual" onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={() => queueMicrotask(resume)}>
            <span className="toast-message">{notification.text}</span>
            {notification.action && <button type="button" className="toast-action" onClick={() => { show(null); notification.action?.onClick(); }}>{notification.action.label}</button>}
          </div>
        )}
      </div>)}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Опасное действие: первое нажатие спрашивает, второе выполняет. Вопрос остаётся, пока фокус на кнопке. */
export function ConfirmButton(p: { label: string; confirmLabel: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  return <>
    <button
      type="button"
      className={`${p.className ?? 'btn-text'} ${armed ? 'danger armed' : ''}`}
      disabled={p.disabled}
      onBlur={() => setArmed(false)}
      onKeyDown={e => { if (armed && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setArmed(false); } }}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        p.onConfirm();
      }}
    >
      {armed ? p.confirmLabel : p.label}
    </button>
    <span className="sr-only" aria-live="assertive">{armed ? `${p.confirmLabel} Нажми ещё раз, чтобы подтвердить.` : ''}</span>
  </>;
}

/** Экран с заголовком; back — куда вести системной кнопкой «Назад». */
export function Screen({ title, back, subtitle, action, className = '', children }: { title: string; back?: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  const [, navigate] = useLocation();
  const onBack = useCallback(() => back && navigate(back), [back, navigate]);
  useBackButton(back ? onBack : null);
  return (
    <main className={`screen ${className}`}>
      <EdgeBackGesture onBack={back ? onBack : null} />
      <header className="screen-heading">
        {back && <Link href={back} className="back-link" aria-label="Назад"><Icon name="back" /></Link>}
        <div className="heading-copy"><h1 className="title" tabIndex={-1}>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}</div>
        {action}
      </header>
      {children}
    </main>
  );
}

export function Loading({ variant = 'list', inline = false }: { variant?: 'list' | 'home' | 'detail' | 'form'; inline?: boolean }) {
  return <div className={`loading loading-${variant} ${inline ? 'loading-inline' : ''}`} role="status" aria-label="Загрузка…">
    <span className="sr-only">Загрузка…</span>
    <div className="skeleton-layout" aria-hidden="true">
      {(variant === 'home' || variant === 'detail') && <div className="skeleton skeleton-feature"><i /><i /><i /></div>}
      {Array.from({ length: variant === 'home' ? 0 : inline ? 2 : 4 }, (_, index) => <div className="skeleton skeleton-row" key={index}><i /><i /></div>)}
    </div>
  </div>;
}

export function ErrorNote({ text, retry }: { text: string; retry?: () => void }) {
  return <div className="card error" role="alert"><Icon name="alert" /><p>{text}</p>{retry && <button className="btn wide" onClick={retry}>Попробовать ещё раз</button>}</div>;
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return <section className="empty-state"><h2>{title}</h2>{text && <p>{text}</p>}{action && <div className="empty-action">{action}</div>}</section>;
}
