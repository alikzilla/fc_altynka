import type { AppTheme } from '@altynka/core';

const CACHE_KEY = 'altynka:theme';

export function getTheme(): AppTheme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(CACHE_KEY, theme);
  } catch {
    // Telegram/browser privacy settings can disable storage; the active choice still applies.
  }
  window.dispatchEvent(new Event('altynka:theme'));
}

export function initializeTheme(): void {
  let cached: string | null = null;
  try {
    cached = localStorage.getItem(CACHE_KEY);
  } catch {
    // Account data can hydrate the preference after the first render.
  }
  applyTheme(cached === 'light' ? 'light' : 'dark');
}
