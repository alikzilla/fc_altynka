import { CLUBS, clubById, contrastRatio } from '@altynka/core';
import { act, cleanup } from '@testing-library/react';
import { clubPatternCss, clubVariables, materialVariables, patternColors } from '../src/lib/clubTheme';
import { applyClub } from '../src/lib/theme';
import { Screen } from '../src/components/ui';
import { player, renderWithApp } from './render';

afterEach(() => {
  cleanup();
  act(() => applyClub(null));
});

test('Screen shows backdrop and heading crest for a club', () => {
  act(() => applyClub('barcelona'));
  const { container } = renderWithApp(<Screen title="Главная"><p>x</p></Screen>, { me: player });
  const backdrop = document.querySelector('.club-backdrop');
  expect(backdrop?.getAttribute('aria-hidden')).toBe('true');
  expect(backdrop?.parentElement).toBe(document.body);
  expect(backdrop?.querySelector('img')?.getAttribute('src')).toBe(clubById('barcelona')!.crest);
  expect(container.querySelector('img.club-heading-crest')?.getAttribute('src')).toBe('/clubs/barcelona.svg');
});

test('Screen without a club has neither', () => {
  const { container } = renderWithApp(<Screen title="Главная"><p>x</p></Screen>, { me: player });
  expect(document.querySelector('.club-backdrop')).toBeNull();
  expect(container.querySelector('.club-heading-crest')).toBeNull();
});

test('Screen with an action has the backdrop but no heading crest', () => {
  act(() => applyClub('barcelona'));
  const { container } = renderWithApp(<Screen title="Главная" action={<button>Ок</button>}><p>x</p></Screen>, { me: player });
  expect(document.querySelector('.club-backdrop')).not.toBeNull();
  expect(container.querySelector('.club-heading-crest')).toBeNull();
});

test('only one backdrop exists while two screens overlap, and it survives the first unmount', () => {
  act(() => applyClub('barcelona'));
  const a = renderWithApp(<Screen title="А"><p>x</p></Screen>, { me: player });
  const b = renderWithApp(<Screen title="Б"><p>x</p></Screen>, { me: player });
  expect(document.querySelectorAll('.club-backdrop')).toHaveLength(1);
  b.unmount();
  expect(document.querySelectorAll('.club-backdrop')).toHaveLength(1);
  a.unmount();
  expect(document.querySelectorAll('.club-backdrop')).toHaveLength(0);
});

test('clubPatternCss: stripes use a 90deg repeating gradient with every colour', () => {
  const css = clubPatternCss({ kind: 'stripes', colors: ['#111111', '#222222'] });
  expect(css).toContain('repeating-linear-gradient(90deg');
  expect(css).toContain('#111111');
  expect(css).toContain('#222222');
});

test('clubPatternCss: solid is a single colour', () => {
  const css = clubPatternCss({ kind: 'solid', colors: ['#abcdef'] });
  expect(css).toContain('#abcdef');
  expect(css).not.toContain('repeating');
});

test('accentInk stays readable on the soft accent tint for every club in both themes', () => {
  for (const club of CLUBS) {
    for (const theme of ['dark', 'light'] as const) {
      const v = clubVariables(club, theme);
      expect(contrastRatio(v['--accent-ink']!, v['--accent-soft']!), `${club.id} ${theme}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('every text colour of the club card is readable on its material for every club', () => {
  const textVars = ['--text', '--hint', '--accent', '--accent-ink', '--plum-ink', '--plum-ink-strong', '--club-ink'];
  for (const club of CLUBS) {
    const v = materialVariables(club);
    for (const name of textVars) {
      for (const bg of [club.material.mid, club.material.base]) {
        expect(contrastRatio(v[name]!, bg), `${club.id} ${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});

// Токены текста страницы (app.css :root и themes.css) и их фон: всё, что стоит под шапкой без своей подложки.
const PAGE = {
  dark: { bg: '#08090b', text: '#f2f1f8', hint: '#b6b2c2', base: 0.55 },
  light: { bg: '#f4f2f7', text: '#241f2e', hint: '#655c71', base: 0.3 },
} as const;
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
/** Цвет узора с прозрачностью `alpha` поверх фона страницы (CSS смешивает в sRGB). */
function over(color: string, bg: string, alpha: number): string {
  const [top, bottom] = [rgb(color), rgb(bg)];
  return '#' + top.map((v, i) => Math.round(v * alpha + bottom[i]! * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}
const readable = (theme: 'dark' | 'light', colors: string[], alpha: number) => colors.every(c => {
  const mixed = over(c, PAGE[theme].bg, alpha);
  return contrastRatio(PAGE[theme].text, mixed) >= 4.5 && contrastRatio(PAGE[theme].hint, mixed) >= 4.5;
});

test('pattern opacity keeps text and hint at 4.5:1 over every drawn colour, as strong as that allows', () => {
  for (const club of CLUBS) {
    for (const theme of ['dark', 'light'] as const) {
      const raw = clubVariables(club, theme)['--club-pattern-opacity'];
      expect(raw, `${club.id} ${theme}`).toMatch(/^0(\.\d{1,2})?$/);
      const alpha = Number(raw);
      expect(alpha, `${club.id} ${theme}`).toBeLessThanOrEqual(PAGE[theme].base);
      expect(readable(theme, patternColors(club.pattern), alpha), `${club.id} ${theme} at ${alpha}`).toBe(true);
      // Не слабее, чем нужно: на 0,01 сильнее уже нечитаемо, либо это базовая прозрачность темы.
      if (alpha < PAGE[theme].base) expect(readable(theme, patternColors(club.pattern), alpha + 0.01), `${club.id} ${theme} could be ${alpha + 0.01}`).toBe(false);
    }
  }
});

test('patternColors: solid draws only its first colour', () => {
  expect(patternColors({ kind: 'solid', colors: ['#111111', '#222222'] })).toEqual(['#111111']);
  expect(patternColors({ kind: 'halves', colors: ['#111111', '#222222'] })).toEqual(['#111111', '#222222']);
});
