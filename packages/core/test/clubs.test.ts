import { CLUBS, CLUB_IDS, CLUB_LEAGUES, clubById, contrastRatio } from '../src';

test('catalog has the 25 launch entries in order with unique ids', () => {
  expect(CLUBS).toHaveLength(25);
  expect(CLUBS.map(c => c.id)).toEqual([...CLUB_IDS]);
  expect(new Set(CLUB_IDS).size).toBe(25);
  expect(CLUBS.slice(0, 3).map(c => c.name)).toEqual(['Манчестер Юнайтед', 'Манчестер Сити', 'Ливерпуль']);
});

test('clubs have a league, national teams do not, crest is named by id', () => {
  for (const c of CLUBS) {
    if (c.kind === 'club') expect(CLUB_LEAGUES).toContain(c.league);
    else expect(c.league).toBeUndefined();
    expect(c.crest).toBe(`/clubs/${c.id}.svg`);
  }
  expect(CLUBS.filter(c => c.kind === 'national').map(c => c.id)).toEqual(['kazakhstan', 'argentina', 'brazil', 'portugal', 'france']);
});

test('unknown or empty id means no club', () => {
  expect(clubById('barcelona')?.name).toBe('Барселона');
  expect(clubById('dinamo-zagreb')).toBeNull();
  expect(clubById(null)).toBeNull();
  expect(clubById(undefined)).toBeNull();
});

test('contrastRatio follows WCAG', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
});

test.each(CLUBS.map(c => [c.id, c] as const))('%s is readable in both themes', (_id, c) => {
  for (const [theme, bg] of [['dark', '#08090b'], ['light', '#f4f2f7']] as const) {
    expect(contrastRatio(c[theme].onAccent, c[theme].accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c[theme].accentInk, bg)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrastRatio(c.material.ink, c.material.mid)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(c.material.ink, c.material.base)).toBeGreaterThanOrEqual(4.5);
  expect(c.pattern.colors.length).toBeGreaterThan(0);
});

test('striped clubs keep their stripes', () => {
  for (const id of ['barcelona', 'juventus', 'milan', 'inter', 'atletico', 'argentina']) expect(clubById(id)!.pattern.kind).toBe('stripes');
});
