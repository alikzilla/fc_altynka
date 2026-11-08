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
export function Screen({ title, back, subtitle, action, className = '', children }: { title: string; back?: string; subtitle?: ReactNode; action?: ReactNode; className?: string; children: ReactNode }) {
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

/**
 * Плейсхолдер строки текста. Ставится внутрь того же элемента, что держит текст в загруженной разметке:
 * строка сохраняет его высоту, поэтому замена на данные ничего не сдвигает. Ширина — в % для блочных
 * элементов и в em для элементов, которые сжимаются по содержимому.
 */
export function Sk({ w }: { w: string }) {
  // span, not i: several layouts style bare <i> as dots (group tag, match meta, game results).
  return <span className="sk" style={{ width: w }} aria-hidden="true" />;
}

/** Скелет загружаемого ресурса: одна озвучиваемая статусная строка, графика скрыта от вспомогательных технологий. */
export function Skeleton({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`loading ${className}`} role="status" aria-label="Загрузка…">
    <span className="sr-only">Загрузка…</span>
    <div className="skeleton-layout" aria-hidden="true">{children}</div>
  </div>;
}

/** Скелет, видимый меньше этого, не заметен: данные после него показываются сразу, без проявления. */
const REVEAL_AFTER_MS = 200;

/**
 * «reveal», когда данные пришли на место скелета, который успели увидеть: они проявляются там, где
 * стоял плейсхолдер. Данные из кеша и почти мгновенные ответы показываются сразу. Класс ставится
 * только на элементы, которые появляются вместе с данными, — уже видимые элементы не мигают.
 */
export function useReveal(pending: boolean) {
  const since = useRef<number | null>(null);
  const reveal = useRef('');
  if (pending) {
    since.current ??= performance.now();
    reveal.current = '';
  } else if (since.current !== null) {
    reveal.current = performance.now() - since.current >= REVEAL_AFTER_MS ? 'reveal' : '';
    since.current = null;
  }
  return reveal.current;
}

export function ErrorNote({ text, retry }: { text: string; retry?: () => void }) {
  return <div className="card error" role="alert"><Icon name="alert" /><p>{text}</p>{retry && <button className="btn wide" onClick={retry}>Попробовать ещё раз</button>}</div>;
}

export function EmptyState({ title, text, action, className = '' }: { title: string; text?: string; action?: ReactNode; className?: string }) {
  return <section className={`empty-state ${className}`}><h2>{title}</h2>{text && <p>{text}</p>}{action && <div className="empty-action">{action}</div>}</section>;
}
