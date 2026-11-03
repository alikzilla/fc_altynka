import { useEffect } from 'react';

interface TgWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  ready(): void;
  expand(): void;
  openLink(url: string): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(type: 'success' | 'error' | 'warning'): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
}

const wa = (): TgWebApp | undefined => (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

export const initData = (): string => wa()?.initData ?? '';
export const startParam = (): string | undefined => wa()?.initDataUnsafe.start_param;

export function ready(): void {
  wa()?.ready();
  wa()?.expand();
}

export function haptic(kind: 'light' | 'success' | 'error'): void {
  const h = wa()?.HapticFeedback;
  if (!h) return;
  if (kind === 'light') h.impactOccurred('light');
  else h.notificationOccurred(kind);
}

export function openLink(url: string): void {
  const w = wa();
  if (w) w.openLink(url);
  else window.open(url, '_blank');
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Системная кнопка «Назад» Telegram; null — спрятать. */
export function useBackButton(onBack: (() => void) | null): void {
  useEffect(() => {
    const b = wa()?.BackButton;
    if (!b) return;
    if (!onBack) {
      b.hide();
      return;
    }
    b.show();
    b.onClick(onBack);
    return () => b.offClick(onBack);
  }, [onBack]);
}
