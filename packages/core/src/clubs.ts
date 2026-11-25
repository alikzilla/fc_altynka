// Каталог клубов и сборных: цвета акцента, материал карточки профиля и узор.
// Чистые данные без I/O: воркер проверяет id, мини-приложение красит тему.

export const CLUB_LEAGUES = ['epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'kpl'] as const;
export type ClubLeague = (typeof CLUB_LEAGUES)[number];

export const CLUB_LEAGUE_LABEL: Record<ClubLeague, string> = {
  epl: 'АПЛ',
  laliga: 'Ла Лига',
  seriea: 'Серия А',
  bundesliga: 'Бундеслига',
  ligue1: 'Лига 1',
  kpl: 'КПЛ',
};

export const CLUB_IDS = [
  'man-united', 'man-city', 'liverpool', 'arsenal', 'chelsea', 'tottenham',
  'real-madrid', 'barcelona', 'atletico',
  'juventus', 'milan', 'inter',
  'bayern', 'dortmund',
  'psg',
  'kairat', 'astana', 'tobol', 'ordabasy', 'aktobe',
  'kazakhstan', 'argentina', 'brazil', 'portugal', 'france',
] as const;
export type ClubId = (typeof CLUB_IDS)[number];

/** Акцент темы: фон кнопки, цвет текста на нём и цвет текста/иконок на фоне страницы. */
export interface ClubAccent { accent: string; onAccent: string; accentInk: string }
/** Материал карточки (как .material-plum): светлое пятно, средний тон, тёмная база. Один на обе темы. */
export interface ClubMaterial { highlight: string; mid: string; base: string; ink: string }
export type ClubPattern = { kind: 'stripes' | 'hoops' | 'halves' | 'solid'; colors: string[] };

export interface Club {
  id: ClubId;
  name: string;
  kind: 'club' | 'national';
  league?: ClubLeague;
  dark: ClubAccent;
  light: ClubAccent;
  material: ClubMaterial;
  pattern: ClubPattern;
  /** Путь к гербу в статике мини-приложения. */
  crest: string;
}

type Spec = {
  id: ClubId;
  name: string;
  league?: ClubLeague;
  /** accent, onAccent, accentInk в тёмной теме */
  d: [string, string, string];
  /** accent, onAccent, accentInk в светлой теме */
  l: [string, string, string];
  /** highlight, mid, base, ink */
  m: [string, string, string, string];
  p: ClubPattern;
};

const W = '#ffffff';
const D = '#0b0b10';

const SPECS: Spec[] = [
  { id: 'man-united', name: 'Манчестер Юнайтед', league: 'epl',
    d: ['#ef4a3e', D, '#ff7a6e'], l: ['#c8281c', W, '#b3231a'],
    m: ['#ef5a4c', '#a3170f', '#2a0605', W], p: { kind: 'solid', colors: ['#da291c'] } },
  { id: 'man-city', name: 'Манчестер Сити', league: 'epl',
    d: ['#8fc9ee', '#0b2034', '#8fc9ee'], l: ['#2a6aa0', W, '#245f92'],
    m: ['#8fc9ee', '#2c6a9c', '#0b2034', W], p: { kind: 'solid', colors: ['#6cabdd'] } },
  { id: 'liverpool', name: 'Ливерпуль', league: 'epl',
    d: ['#ee4452', D, '#ff7680'], l: ['#c8102e', W, '#b50e29'],
    m: ['#f0505e', '#a8121f', '#2c0508', W], p: { kind: 'solid', colors: ['#c8102e'] } },
  { id: 'arsenal', name: 'Арсенал', league: 'epl',
    d: ['#ef3340', D, '#ff7b84'], l: ['#d0101f', W, '#bd0e1c'],
    m: ['#f0505e', '#a60f1c', '#2a0508', W], p: { kind: 'halves', colors: ['#ef0107', '#ffffff'] } },
  { id: 'chelsea', name: 'Челси', league: 'epl',
    d: ['#5b8be8', D, '#7fa6ff'], l: ['#2152b8', W, '#1d4aa8'],
    m: ['#4f7fe0', '#123f9a', '#061430', W], p: { kind: 'solid', colors: ['#034694'] } },
  { id: 'tottenham', name: 'Тоттенхэм', league: 'epl',
    d: ['#8fa0c8', '#0b1230', '#9fb0d8'], l: ['#132257', W, '#132257'],
    m: ['#7c8fc4', '#26386e', '#0a1230', W], p: { kind: 'solid', colors: ['#132257', '#ffffff'] } },

  { id: 'real-madrid', name: 'Реал Мадрид', league: 'laliga',
    d: ['#e9d18a', '#1d1b29', '#e9d18a'], l: ['#7a5f12', W, '#6f560f'],
    m: ['#ffffff', '#d9d6e2', '#b9b4c6', '#1d1b29'], p: { kind: 'solid', colors: ['#ffffff', '#c9a227'] } },
  { id: 'barcelona', name: 'Барселона', league: 'laliga',
    d: ['#ef6f95', '#2a0612', '#ef6f95'], l: ['#b8174a', W, '#a8153f'],
    m: ['#d6386a', '#8c1238', '#2a0612', W], p: { kind: 'stripes', colors: ['#1d4fa3', '#a3123f'] } },
  { id: 'atletico', name: 'Атлетико', league: 'laliga',
    d: ['#ef4a50', D, '#ff7d82'], l: ['#c8202a', W, '#b51c25'],
    m: ['#e24a52', '#a01d26', '#2a0808', W], p: { kind: 'stripes', colors: ['#cb3524', '#ffffff'] } },

  { id: 'juventus', name: 'Ювентус', league: 'seriea',
    d: ['#e6e6ea', '#0b0b10', '#e6e6ea'], l: ['#202026', W, '#202026'],
    m: ['#6a6a74', '#2f2f37', '#0c0c10', W], p: { kind: 'stripes', colors: ['#000000', '#ffffff'] } },
  { id: 'milan', name: 'Милан', league: 'seriea',
    d: ['#ef3d44', D, '#ff7b80'], l: ['#c8101a', W, '#b50e17'],
    m: ['#e63a42', '#9c101a', '#1c0507', W], p: { kind: 'stripes', colors: ['#fb090b', '#000000'] } },
  { id: 'inter', name: 'Интер', league: 'seriea',
    d: ['#5f93e8', D, '#86aef5'], l: ['#1a4ba8', W, '#16428f'],
    m: ['#3f74d4', '#14409a', '#060b1c', W], p: { kind: 'stripes', colors: ['#0068a8', '#000000'] } },

  { id: 'bayern', name: 'Бавария', league: 'bundesliga',
    d: ['#ee3a50', D, '#ff7d8e'], l: ['#c8102e', W, '#b50e29'],
    m: ['#e2384c', '#a50f2e', '#1a0710', W], p: { kind: 'solid', colors: ['#dc052d', '#0066b2'] } },
  { id: 'dortmund', name: 'Боруссия Дортмунд', league: 'bundesliga',
    d: ['#fde100', '#1a1500', '#fde100'], l: ['#6e5c00', W, '#645400'],
    m: ['#e6c22a', '#8a7006', '#1f1802', W], p: { kind: 'solid', colors: ['#fde100', '#000000'] } },

  { id: 'psg', name: 'ПСЖ', league: 'ligue1',
    d: ['#5a82d8', D, '#86a6ee'], l: ['#1b3d85', W, '#173574'],
    m: ['#3f5fb0', '#1c2f6e', '#060a1c', W], p: { kind: 'hoops', colors: ['#004170', '#da291c'] } },

  { id: 'kairat', name: 'Кайрат', league: 'kpl',
    d: ['#ffd51f', '#221a02', '#ffd51f'], l: ['#6b5600', W, '#5f4c00'],
    m: ['#e6c22a', '#876c06', '#221a02', W], p: { kind: 'solid', colors: ['#ffe600', '#000000'] } },
  { id: 'astana', name: 'Астана', league: 'kpl',
    d: ['#4fc3f0', '#05202e', '#4fc3f0'], l: ['#0a6b9a', W, '#085f89'],
    m: ['#2fa6dc', '#0a5f8f', '#04141f', W], p: { kind: 'solid', colors: ['#00a3e0', '#ffd100'] } },
  { id: 'tobol', name: 'Тобол', league: 'kpl',
    d: ['#4fc3a0', '#04241a', '#4fc3a0'], l: ['#0d6e55', W, '#0b6049'],
    m: ['#2fa584', '#0d5f48', '#04180f', W], p: { kind: 'solid', colors: ['#0b8f6e'] } },
  { id: 'ordabasy', name: 'Ордабасы', league: 'kpl',
    d: ['#f0a030', '#2a1600', '#f0a030'], l: ['#8a4c00', W, '#7a4300'],
    m: ['#d98a2a', '#8c4f08', '#241200', W], p: { kind: 'halves', colors: ['#f08a00', '#000000'] } },
  { id: 'aktobe', name: 'Актобе', league: 'kpl',
    d: ['#4f8fe8', D, '#7fb0f5'], l: ['#1a4f9e', W, '#164488'],
    m: ['#3f7fd4', '#154c96', '#06101f', W], p: { kind: 'solid', colors: ['#1d5fb8', '#ffffff'] } },

  { id: 'kazakhstan', name: 'Казахстан',
    d: ['#4fc3f0', '#05202e', '#4fc3f0'], l: ['#0a6b9a', W, '#085f89'],
    m: ['#2fa6dc', '#0a5f8f', '#04141f', W], p: { kind: 'solid', colors: ['#00afca', '#fec50c'] } },
  { id: 'argentina', name: 'Аргентина',
    d: ['#7cc4ee', '#0a2236', '#7cc4ee'], l: ['#2a6aa0', W, '#245f92'],
    m: ['#8fc9ee', '#2c6a9c', '#0b2034', W], p: { kind: 'stripes', colors: ['#74acdf', '#ffffff'] } },
  { id: 'brazil', name: 'Бразилия',
    d: ['#ffd51f', '#1a1500', '#ffd51f'], l: ['#0b6b34', W, '#095c2d'],
    m: ['#2fa65a', '#0b6b34', '#04180c', W], p: { kind: 'solid', colors: ['#009c3b', '#ffdf00'] } },
  { id: 'portugal', name: 'Португалия',
    d: ['#e8404a', D, '#ff7d86'], l: ['#a5121f', W, '#930f1b'],
    m: ['#c8283a', '#8a0f20', '#1f0508', W], p: { kind: 'halves', colors: ['#006600', '#ff0000'] } },
  { id: 'france', name: 'Франция',
    d: ['#5a82e8', D, '#86a6f5'], l: ['#1b3fa0', W, '#173587'],
    m: ['#3f66cc', '#17358f', '#060b24', W], p: { kind: 'solid', colors: ['#0055a4', '#ffffff', '#ef4135'] } },
];

export const CLUBS: readonly Club[] = SPECS.map(s => ({
  id: s.id,
  name: s.name,
  kind: s.league ? 'club' : 'national',
  ...(s.league ? { league: s.league } : {}),
  dark: { accent: s.d[0], onAccent: s.d[1], accentInk: s.d[2] },
  light: { accent: s.l[0], onAccent: s.l[1], accentInk: s.l[2] },
  material: { highlight: s.m[0], mid: s.m[1], base: s.m[2], ink: s.m[3] },
  pattern: s.p,
  crest: `/clubs/${s.id}.svg`,
}));

const BY_ID = new Map<string, Club>(CLUBS.map(c => [c.id, c]));

export function clubById(id: string | null | undefined): Club | null {
  return (id && BY_ID.get(id)) || null;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Контраст WCAG между двумя цветами `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
