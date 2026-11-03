import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useBackButton } from './tg';

const ToastCtx = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((t: string) => {
    setText(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 2500);
  }, []);
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
export function ConfirmButton(p: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
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
      aria-label={p.label}
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
export function Screen({ title, back, children }: { title: string; back?: string; children: ReactNode }) {
  const [, navigate] = useLocation();
  const onBack = useCallback(() => back && navigate(back), [back, navigate]);
  useBackButton(back ? onBack : null);
  return (
    <main className="screen">
      <h1 className="title">{title}</h1>
      {children}
    </main>
  );
}

export function Loading() {
  return <div className="muted center">Загрузка…</div>;
}

export function ErrorNote({ text }: { text: string }) {
  return <div className="card error">{text}</div>;
}
