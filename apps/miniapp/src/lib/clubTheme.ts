import type { AppTheme, Club, ClubPattern } from '@altynka/core';

const PAGE_BG: Record<AppTheme, string> = { dark: '#08090b', light: '#f4f2f7' };
const STRIPE_WIDTH = 34;
/** Доля акцента в мягком фоне чипов (поверх цвета страницы). */
const SOFT_SHARE = 0.16;

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function mix(top: string, bottom: string, share: number): string {
  const a = channels(top);
  const b = channels(bottom);
  return '#' + a.map((v, i) => Math.round(v * share + b[i]! * (1 - share)).toString(16).padStart(2, '0')).join('');
}

/** CSS-узор шапки клуба: полосы, кольца, половины или один цвет. */
export function clubPatternCss(pattern: ClubPattern): string {
  const colors = pattern.colors;
  const first = colors[0] ?? 'transparent';
  if (pattern.kind === 'solid' || colors.length < 2) return `linear-gradient(${first}, ${first})`;
  if (pattern.kind === 'halves') {
    const step = 100 / colors.length;
    return `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
  }
  const angle = pattern.kind === 'hoops' ? '180deg' : '90deg';
  return `repeating-linear-gradient(${angle}, ${colors.map((c, i) => `${c} ${i * STRIPE_WIDTH}px ${(i + 1) * STRIPE_WIDTH}px`).join(', ')})`;
}

/** Переменные, которыми клуб перекрашивает акцент приложения в выбранной теме. */
export function clubVariables(club: Club, theme: AppTheme): Record<string, string> {
  const t = club[theme];
  return {
    '--accent': t.accent,
    '--accent-ink': t.accentInk,
    '--on-accent': t.onAccent,
    '--accent-soft': mix(t.accent, PAGE_BG[theme], SOFT_SHARE),
    '--club-accent': t.accent,
    '--club-on-accent': t.onAccent,
    '--club-pattern': clubPatternCss(club.pattern),
  };
}

/** Переменные клубной карточки (материал). */
export function materialVariables(club: Club): Record<string, string> {
  const m = club.material;
  return {
    '--club-hi': m.highlight,
    '--club-mid': m.mid,
    '--club-base': m.base,
    '--club-ink': m.ink,
    '--plum-ink': m.ink,
    '--plum-ink-strong': m.ink,
  };
}
