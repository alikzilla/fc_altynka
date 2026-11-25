import { CLUBS, clubById, contrastRatio } from '@altynka/core';
import { act, cleanup } from '@testing-library/react';
import { clubPatternCss, clubVariables } from '../src/lib/clubTheme';
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
