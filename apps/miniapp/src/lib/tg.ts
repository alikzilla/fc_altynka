import { useEffect } from 'react';
import { getTheme } from './theme';

interface TgWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  ready(): void;
  expand(): void;
  colorScheme?: 'light' | 'dark';
  isVersionAtLeast?(version: string): boolean;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent?(event: string, callback: () => void): void;
  offEvent?(event: string, callback: () => void): void;
  openLink(url: string): void;
  openTelegramLink?(url: string): void;
  requestWriteAccess?(callback: (granted: boolean) => void): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(type: 'success' | 'error' | 'warning'): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
}

const wa = (): TgWebApp | undefined => (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

export const initData = (): string => wa()?.initData ?? '';
export const startParam = (): string | undefined => wa()?.initDataUnsafe.start_param;

export function ready(): () => void {
  const app = wa();
  const syncTheme = () => {
    const theme = getTheme();
    const color = theme === 'light' ? '#f4f2f7' : '#08090b';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    if (app?.isVersionAtLeast?.('6.9')) app.setHeaderColor?.(color);
    if (app?.isVersionAtLeast?.('6.1')) app.setBackgroundColor?.(color);
    if (app?.isVersionAtLeast?.('7.10')) app.setBottomBarColor?.(color);
  };
  syncTheme();
  app?.onEvent?.('themeChanged', syncTheme);
  window.addEventListener('altynka:theme', syncTheme);
  // Keep native close/minimize gestures out of the app's scroll and sheet gestures.
  if (app?.isVersionAtLeast?.('7.7')) app.disableVerticalSwipes?.();
  app?.ready();
  app?.expand();
  return () => {
    app?.offEvent?.('themeChanged', syncTheme);
    window.removeEventListener('altynka:theme', syncTheme);
  };
}

export function haptic(kind: 'light' | 'heavy' | 'success' | 'error'): void {
  const h = wa()?.HapticFeedback;
  if (!h) return;
  if (kind === 'light' || kind === 'heavy') h.impactOccurred(kind);
  else h.notificationOccurred(kind);
}

export function openLink(url: string): void {
  const w = wa();
  if (w) w.openLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

/** Keep bot links inside Telegram, including the voluntary notification setup. */
export function openTelegramLink(url: string): void {
  const app = wa();
  if (app?.openTelegramLink) app.openTelegramLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

/** Telegram's own «Переслать» chooser with a link and a line of text. */
export function shareLink(url: string, text: string): void {
  openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
}

/** null means the client cannot offer the native permission dialog. */
export async function requestWriteAccess(): Promise<boolean | null> {
  const app = wa();
  if (!app?.isVersionAtLeast?.('6.9') || !app.requestWriteAccess) return null;
  return new Promise(resolve => {
    try {
      app.requestWriteAccess!(granted => resolve(granted));
    } catch {
      resolve(null);
    }
  });
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

const backOwners: { callback: (() => void) | null }[] = [];
export const getBackAction = (): (() => void) | null => backOwners.at(-1)?.callback ?? null;
let nativeBack: TgWebApp['BackButton'];
let nativeHandler: (() => void) | null = null;
function syncBackButton() {
  if (nativeHandler) nativeBack?.offClick(nativeHandler);
  nativeBack = wa()?.BackButton;
  nativeHandler = getBackAction();
  if (nativeHandler) { nativeBack?.show(); nativeBack?.onClick(nativeHandler); }
  else nativeBack?.hide();
}

/** Only the topmost screen/sheet owns Telegram Back; restore its parent on close. */
export function useBackButton(onBack: (() => void) | null): void {
  useEffect(() => {
    const owner = { callback: onBack };
    backOwners.push(owner);
    syncBackButton();
    return () => { backOwners.splice(backOwners.indexOf(owner), 1); syncBackButton(); };
  }, [onBack]);
}
