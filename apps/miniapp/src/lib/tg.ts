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
  platform?: string;
  isFullscreen?: boolean;
  requestFullscreen?(): void;
  exitFullscreen?(): void;
  addToHomeScreen?(): void;
  checkHomeScreenStatus?(callback: (status: HomeScreenStatus) => void): void;
  openLink(url: string): void;
  openTelegramLink?(url: string): void;
  requestWriteAccess?(callback: (granted: boolean) => void): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(type: 'success' | 'error' | 'warning'): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
}

/** Telegram's answer about the mini app's icon on the phone's home screen. */
export type HomeScreenStatus = 'unsupported' | 'unknown' | 'added' | 'missed';

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
  // On phones the app takes the whole screen, like an installed app, unless turned off on this device.
  if (canFullscreen() && fullscreenPreferred()) applyFullscreen(true);
  return () => {
    app?.offEvent?.('themeChanged', syncTheme);
    window.removeEventListener('altynka:theme', syncTheme);
  };
}

const FULLSCREEN_KEY = 'altynka:fullscreen';
const PHONES = new Set(['ios', 'android', 'android_x']);

/** Full screen exists only in Telegram 8.0+ on phones; on computers the mini app keeps its window. */
export function canFullscreen(): boolean {
  const app = wa();
  return !!app?.requestFullscreen && !!app.isVersionAtLeast?.('8.0') && PHONES.has(app.platform ?? '');
}

/** The choice is per device: one phone can show full screen while another does not. */
export function fullscreenPreferred(): boolean {
  try { return localStorage.getItem(FULLSCREEN_KEY) !== 'off'; } catch { return true; }
}

function applyFullscreen(on: boolean): void {
  const app = wa();
  try {
    if (on && !app?.isFullscreen) app?.requestFullscreen?.();
    if (!on && app?.isFullscreen) app?.exitFullscreen?.();
  } catch {
    // Telegram throws on clients without the method; the app simply stays in its window.
  }
}

export function setFullscreenPreferred(on: boolean): void {
  try { localStorage.setItem(FULLSCREEN_KEY, on ? 'on' : 'off'); } catch { /* storage may be disabled; the choice still applies now */ }
  applyFullscreen(on);
}

/**
 * Telegram's own shortcut: an FC Altynka icon on the phone's home screen that opens the mini app directly.
 * Reports the current status and again once the icon is added; returns the unsubscribe. Reports nothing
 * outside Telegram or on clients without the feature.
 */
export function watchHomeScreen(report: (status: HomeScreenStatus) => void): () => void {
  const app = wa();
  if (!app?.isVersionAtLeast?.('8.0') || !app.checkHomeScreenStatus) return () => {};
  const added = () => report('added');
  app.onEvent?.('homeScreenAdded', added);
  try {
    app.checkHomeScreenStatus(report);
  } catch {
    // The client advertises the version but not the method.
  }
  return () => app.offEvent?.('homeScreenAdded', added);
}

export function addToHomeScreen(): void {
  try { wa()?.addToHomeScreen?.(); } catch { /* not available on this client */ }
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
