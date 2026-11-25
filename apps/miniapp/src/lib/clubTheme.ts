import { contrastRatio, type AppTheme, type Club, type ClubPattern } from '@altynka/core';

const PAGE_BG: Record<AppTheme, string> = { dark: '#08090b', light: '#f4f2f7' };
/** Текст и подсказка страницы (--text, --hint в app.css и themes.css): подзаголовок экрана стоит прямо на шапке. */
const PAGE_TEXT: Record<AppTheme, [string, string]> = { dark: ['#f2f1f8', '#b6b2c2'], light: ['#241f2e', '#655c71'] };
/** Прозрачность узора шапки по спеке; ниже, если иначе текст на узоре не читается. */
const PATTERN_OPACITY: Record<AppTheme, number> = { dark: 0.55, light: 0.3 };
const STRIPE_WIDTH = 34;
/** Доля акцента в мягком фоне чипов (поверх цвета страницы). */
const SOFT_SHARE = 0.1;

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function mix(top: string, bottom: string, share: number): string {
  const a = channels(top);
  const b = channels(bottom);
  return '#' + a.map((v, i) => Math.round(v * share + b[i]! * (1 - share)).toString(16).padStart(2, '0')).join('');
}

/** Цвета, которые узор действительно рисует: у `solid` только первый. */
export function patternColors(pattern: ClubPattern): string[] {
  return pattern.kind === 'solid' ? pattern.colors.slice(0, 1) : pattern.colors;
}

/** CSS-узор шапки клуба: полосы, кольца, половины или один цвет. */
export function clubPatternCss(pattern: ClubPattern): string {
  const colors = patternColors(pattern);
  const first = colors[0] ?? 'transparent';
  if (colors.length < 2) return `linear-gradient(${first}, ${first})`;
  if (pattern.kind === 'halves') {
    const step = 100 / colors.length;
    return `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
  }
  const angle = pattern.kind === 'hoops' ? '180deg' : '90deg';
  return `repeating-linear-gradient(${angle}, ${colors.map((c, i) => `${c} ${i * STRIPE_WIDTH}px ${(i + 1) * STRIPE_WIDTH}px`).join(', ')})`;
}

/**
 * Самая сильная прозрачность узора (шаг 0,01, не выше спеки), при которой текст и подсказка страницы
 * поверх каждого цвета узора дают не меньше 4,5:1. Верх шапки — узор в полную силу, без маски.
 */
function patternOpacity(club: Club, theme: AppTheme): number {
  const bg = PAGE_BG[theme];
  const colors = patternColors(club.pattern);
  const readable = (alpha: number) => colors.every(color => {
    const mixed = mix(color, bg, alpha);
    return PAGE_TEXT[theme].every(text => contrastRatio(text, mixed) >= 4.5);
  });
  let steps = Math.round(PATTERN_OPACITY[theme] * 100);
  while (steps > 0 && !readable(steps / 100)) steps--;
  return steps / 100;
}

/** Имена всех переменных клуба на <html>: по этому списку их и снимают при «Без клуба». */
export const CLUB_VARIABLES = ['--accent', '--accent-ink', '--on-accent', '--accent-soft', '--club-accent', '--club-on-accent', '--club-pattern', '--club-pattern-opacity'] as const;

/** Переменные, которыми клуб перекрашивает акцент приложения в выбранной теме. */
export function clubVariables(club: Club, theme: AppTheme): Record<(typeof CLUB_VARIABLES)[number], string> {
  const t = club[theme];
  return {
    '--accent': t.accent,
    '--accent-ink': t.accentInk,
    '--on-accent': t.onAccent,
    '--accent-soft': mix(t.accent, PAGE_BG[theme], SOFT_SHARE),
    '--club-accent': t.accent,
    '--club-on-accent': t.onAccent,
    '--club-pattern': clubPatternCss(club.pattern),
    '--club-pattern-opacity': String(patternOpacity(club, theme)),
  };
}

/** Второй тон текста карточки: чуть мягче чернил, но не ниже 4,5:1 на среднем и тёмном тонах. */
function softInk(m: Club['material']): string {
  for (const share of [0.82, 0.88, 0.94]) {
    const soft = mix(m.ink, m.mid, share);
    if (contrastRatio(soft, m.mid) >= 4.6 && contrastRatio(soft, m.base) >= 4.6) return soft;
  }
  return m.ink;
}

/** Переменные клубной карточки (материал): краски и все токены текста, чтобы карточка читалась и на светлом материале. */
export function materialVariables(club: Club): Record<string, string> {
  const m = club.material;
  const soft = softInk(m);
  return {
    '--club-hi': m.highlight,
    '--club-mid': m.mid,
    '--club-base': m.base,
    '--club-ink': m.ink,
    '--club-ink-soft': soft,
    '--text': m.ink,
    '--hint': soft,
    '--accent': m.ink,
    '--accent-ink': m.ink,
    '--accent-soft': mix(m.ink, m.mid, 0.14),
    '--plum-ink': soft,
    '--plum-ink-strong': m.ink,
  };
}
