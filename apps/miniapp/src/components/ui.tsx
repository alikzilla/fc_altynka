import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Icon } from './Icon';
import { useBackButton } from '../lib/tg';
import { EdgeBackGesture } from './EdgeBackGesture';

const ToastCtx = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((t: string) => {
    setText(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 2500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {text && (
        <div className="toast" role="status">
          {text}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Опасное действие: первое нажатие спрашивает, второе выполняет. */
export function ConfirmButton(p: { label: string; confirmLabel: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${p.className ?? 'btn-text'} ${armed ? 'danger' : ''}`}
      aria-label={armed ? p.confirmLabel : p.label}
      disabled={p.disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        p.onConfirm();
      }}
    >
      {armed ? p.confirmLabel : p.label}
    </button>
  );
}

/** Экран с заголовком; back — куда вести системной кнопкой «Назад». */
export function Screen({ title, back, subtitle, action, children }: { title: string; back?: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  const [, navigate] = useLocation();
  const onBack = useCallback(() => back && navigate(back), [back, navigate]);
  useBackButton(back ? onBack : null);
  return (
    <main className="screen">
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
