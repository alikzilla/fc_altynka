# Любимый клуб и клубная тема — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Игрок выбирает любимый клуб; у него появляется клубный акцент, шапка с узором и эмблемой, а его карточка профиля у всех окрашивается в цвет клуба.

**Architecture:** Каталог клубов с цветами и узором — одна запись на клуб в `packages/core/src/clubs.ts`. Сервер хранит только `users.favorite_club` и проверяет его по `CLUB_IDS`. Мини-апп по записи выставляет CSS-переменные на `<html>` (через `style.setProperty`), рисует шапку в общем `Screen` и окрашивает `PlayerSportsCard` инлайн-переменными; эмблемы — SVG в `apps/miniapp/public/clubs/`.

**Tech Stack:** TypeScript, Hono + zod + Drizzle/D1 (worker), React 19 + Wouter + TanStack Query (miniapp), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-club-themes-design.md` (макеты — `docs/superpowers/specs/2026-11-25-club-themes-mockups/`).

## Global Constraints

- Весь пользовательский текст и документация — на русском.
- Тексты, зафиксированные спекой: «Любимый клуб», «Не выбран», «Клубы», «Сборные», «Все», «АПЛ», «Ла Лига», «Серия А», «Бундеслига», «Лига 1», «КПЛ», «Без клуба», «Обычная тема», «Список клубов будет пополняться», подпись эмблемы в карточке «Любимый клуб: <название>».
- Каталог на старте — ровно 25 позиций из спеки, порядок внутри лиги как в спеке.
- Контраст: `onAccent`/`accent` ≥ 4,5:1; `accentInk` на фоне `#08090b` (тёмная) и `#f4f2f7` (светлая) ≥ 4,5:1; текст материала на его `mid` и `base` ≥ 4,5:1.
- Клуб красит только: `--accent`, `--accent-ink`, `--on-accent`, `--accent-soft`, кольцо фокуса, выделение, `.btn.primary` вне цветных материалов, ссылки/чипы на фоне, подсветку выбранной иконки дока. Материалы, кнопки на них, `--warn`, `--danger`, медали, подиум — не меняются.
- Шапка: ~300 px, узор с прозрачностью ~0,55 (тёмная) / ~0,3 (светлая), эмблема ~0,2 по центру, маска растворяет вниз, прокручивается со страницей, `pointer-events: none`, `aria-hidden`; скрыта при `prefers-contrast: more`. Не в шторках.
- Маленькая эмблема ~30×36 px справа в заголовке `Screen`, только если у `Screen` нет `action`; `aria-hidden`.
- Без клуба — всё как сейчас (никакой шапки, `material-plum`, текущие цвета).
- Неизвестный id клуба (в кэше, в БД, в ответе API) = «без клуба», без ошибок.
- Эмблемы только с нашего домена, `apps/miniapp/public/clubs/<id>.svg`, каждая ≤ 30 КБ; при отсутствии приличного SVG — заглушка-щит в клубном цвете с коротким названием под тем же именем. CSP не трогать.
- Цвета Telegram (шапка/фон/нижняя панель) не меняются.
- Миграция `0022_favorite_club` (ветка таймера тоже занимает `0022`; вторая слитая ветка перенумеровывает).
- Выкладка на staging — только с разрешения пользователя (там сейчас таймер).

**Ruling (план против спеки):** материал карточки один для обеих тем, а не два набора. Причина: в DESIGN.md цветные карточки (сливовая и др.) одинаковы в тёмной и светлой теме; клубная карточка заменяет сливовую и ведёт себя так же. Темам различаются только `accent`/`onAccent`/`accentInk`.

## Review Focus

1. Переключение тёмная ↔ светлая при выбранном клубе — переменные клуба пересчитываются под новую тему (тест в Task 4).
2. Чужой профиль с другим клубом, чем у смотрящего — карточка в цвете клуба владельца профиля, а не смотрящего (тест в Task 5).
3. Быстрые повторные нажатия на разные клубы и ошибка сохранения — побеждает последнее нажатие, откат возвращает клуб, который был до ошибки (тест в Task 6).
4. В кэше `altynka:club` лежит id, которого нет в каталоге (клуб убрали) — приложение стартует без клуба и без ошибки (тест в Task 4).
5. Узкий экран 320 px и длинные названия («Боруссия Дортмунд», «Манчестер Юнайтед») — плитки и чипы не дают горизонтального скролла страницы (тест в Task 7).

---

### Task 1: Каталог клубов и контраст (core)

**Files:**
- Create: `packages/core/src/clubs.ts`
- Modify: `packages/core/src/index.ts` (экспорт)
- Test: `packages/core/test/clubs.test.ts`

**Interfaces:**
- Produces:
  - `CLUB_LEAGUES = ['epl','laliga','seriea','bundesliga','ligue1','kpl'] as const`, `type ClubLeague`, `CLUB_LEAGUE_LABEL: Record<ClubLeague,string>` (АПЛ, Ла Лига, Серия А, Бундеслига, Лига 1, КПЛ).
  - `CLUB_IDS` (as const, порядок каталога), `type ClubId`.
  - `interface ClubAccent { accent: string; onAccent: string; accentInk: string }`
  - `interface ClubMaterial { highlight: string; mid: string; base: string; ink: string }`
  - `type ClubPattern = { kind: 'stripes' | 'hoops' | 'halves' | 'solid'; colors: string[] }`
  - `interface Club { id: ClubId; name: string; kind: 'club' | 'national'; league?: ClubLeague; dark: ClubAccent; light: ClubAccent; material: ClubMaterial; pattern: ClubPattern; crest: string }` (`crest` = `/clubs/<id>.svg`).
  - `CLUBS: readonly Club[]`, `clubById(id: string | null | undefined): Club | null`.
  - `contrastRatio(a: string, b: string): number` (WCAG, цвета `#rrggbb`).

Ids и названия (порядок = порядок каталога):
`man-united` Манчестер Юнайтед, `man-city` Манчестер Сити, `liverpool` Ливерпуль, `arsenal` Арсенал, `chelsea` Челси, `tottenham` Тоттенхэм (epl); `real-madrid` Реал Мадрид, `barcelona` Барселона, `atletico` Атлетико (laliga); `juventus` Ювентус, `milan` Милан, `inter` Интер (seriea); `bayern` Бавария, `dortmund` Боруссия Дортмунд (bundesliga); `psg` ПСЖ (ligue1); `kairat` Кайрат, `astana` Астана, `tobol` Тобол, `ordabasy` Ордабасы, `aktobe` Актобе (kpl); `kazakhstan` Казахстан, `argentina` Аргентина, `brazil` Бразилия, `portugal` Португалия, `france` Франция (national, без `league`).

Узоры `stripes` обязательны у: barcelona (синий, гранатовый), juventus (чёрный, белый), milan (красный, чёрный), inter (синий, чёрный), atletico (красный, белый), argentina (небесный, белый). Остальным — по узнаваемости (`solid`/`halves`/`hoops`). Ориентиры цветов — `club-accent-cards.html`: Барселона гранатовый, Реал жемчужный (светлый материал, тёмный `ink`), Ман Сити небесный, Ливерпуль красный, Челси синий, Кайрат золотой (материал затемнён до золота, белый `ink`).

- [ ] **Step 1: Write the failing tests** — `packages/core/test/clubs.test.ts`:

```ts
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
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @altynka/core exec vitest run test/clubs.test.ts` → модуль/экспорты не найдены.
- [ ] **Step 3: Implement `clubs.ts`** по Interfaces; цвета подобрать так, чтобы проходил тест контраста и цвет узнавался.
- [ ] **Step 4: Run, expect PASS** — та же команда; затем `pnpm --filter @altynka/core exec tsc --noEmit`.
- [ ] **Step 5: Commit** — `git add packages/core && git commit -m "core: club catalog with colours, patterns and contrast check"`

---

### Task 2: Любимый клуб на сервере, политика и удаление данных

**Files:**
- Create: `apps/worker/migrations/0022_favorite_club.sql` (`ALTER TABLE users ADD COLUMN favorite_club TEXT;` с русским комментарием в стиле `0021`), запись в `migrations/meta/_journal.json` (`idx: 22`, `tag: "0022_favorite_club"`, `when` больше предыдущего).
- Modify: `apps/worker/src/db/schema.ts` (`favoriteClub: text('favorite_club')`, без `enum`), `packages/core/src/api.ts` (`MeDto.favoriteClub?: ClubId | null`), `packages/core/src/ratings.ts` (`PlayerProfileDto.favoriteClub: ClubId | null`), `apps/worker/src/api/members.ts` (`profileDetails` + PATCH), `apps/worker/src/domain/ratings.ts` (профиль игрока, рядом с `pinnedAchievement`), `apps/worker/src/domain/privacy.ts` (обнуление), `apps/miniapp/public/privacy.html`.
- Test: `apps/worker/test/api/favoriteClub.test.ts` (по образцу `test/api/theme.test.ts`), `apps/worker/test/domain/privacy.test.ts`, профиль — в существующем `test/api/profile.test.ts` или `ratings.test.ts` (где тестируется `/api/players/:id`).

**Interfaces:**
- Consumes: `CLUB_IDS`, `ClubId`, `clubById` (Task 1).
- Produces: `GET/PATCH /api/me` → `favoriteClub: ClubId | null`; `PATCH /api/me` принимает `favoriteClub: z.enum(CLUB_IDS).nullable().optional()`; `GET /api/players/:id` → `favoriteClub: ClubId | null`. Сохранённый id, которого нет в каталоге, отдаётся как `null` (`clubById(v)?.id ?? null`).

- [ ] **Step 1: Write failing tests:**
  - `favoriteClub.test.ts`: «defaults to null, persists barcelona, clears with null, other user unaffected» — `GET /api/me` → `favoriteClub: null`; `PATCH {favoriteClub:'barcelona'}` → ответ и следующий GET с `'barcelona'`; другой пользователь видит `null`; `PATCH {favoriteClub:null}` → `null`.
  - там же «rejects an unknown club with 400 and keeps the stored value».
  - там же «a stored id missing from the catalog reads as null» (записать `'dinamo-zagreb'` напрямую в D1, GET → `null`).
  - профиль: «player profile carries the owner's favourite club» — участник общей группы получает `favoriteClub: 'barcelona'` у игрока, выбравшего Барселону.
  - `privacy.test.ts`: в существующем тесте удаления данных — после удаления `favoriteClub` у строки пользователя `null`.
- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @altynka/worker exec vitest run test/api/favoriteClub.test.ts test/domain/privacy.test.ts`.
- [ ] **Step 3: Implement** миграцию, схему, DTO, PATCH, профиль, обнуление в `privacy.ts`.
- [ ] **Step 4: Политика** — в `privacy.html` в списке настроек «настройки: уведомления, тема, любимый клуб, закреплённое достижение»; в разделе о том, кто что видит, — любимый клуб видят участники общих групп в профиле; дата редакции — текущая дата выпуска («редакция от 25 ноября 2026», если выпускается сегодня; иначе дата выпуска).
- [ ] **Step 5: Run, expect PASS** — `pnpm --filter @altynka/worker exec vitest run`, `pnpm test:migrations`, `pnpm typecheck`.
- [ ] **Step 6: Commit** — `git commit -m "worker: favourite club on the account and player profile"`

---

### Task 3: Эмблемы

**Files:**
- Create: `apps/miniapp/public/clubs/<id>.svg` × 25
- Test: `apps/miniapp/test/clubCrests.test.ts`

**Interfaces:**
- Consumes: `CLUBS` (Task 1).
- Produces: файл `/clubs/<id>.svg` для каждого id.

- [ ] **Step 1: Write the failing test** — `clubCrests.test.ts` (node `fs`, путь от `__dirname`/`import.meta.url` до `public/clubs`):
  - «every catalog club has a crest file under 30 KB» — для каждого `CLUBS` файл существует, `size <= 30 * 1024`, начинается с `<svg` (после возможного `<?xml`), содержит `viewBox`.
  - «crest files contain no scripts or external references» — нет `<script`, `on[a-z]+=`, `href="http`, `xlink:href="http`.
- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @altynka/miniapp exec vitest run test/clubCrests.test.ts`.
- [ ] **Step 3: Собрать эмблемы.** Векторные версии из Wikimedia Commons / Википедии; оптимизировать (`npx svgo@3.3.2 --multipass`), убрать метаданные. Если приличного SVG нет или файл не влезает в 30 КБ после оптимизации — заглушка: щит (`viewBox="0 0 100 120"`) в `material.mid` клуба с 2–4 буквами (`FCB`, `KAI`…) цветом `material.ink`. В отчёте перечислить, какие эмблемы настоящие, какие заглушки, и источник каждой настоящей.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "miniapp: club crests"`

---

### Task 4: Применение клубной темы, шапка и эмблема у заголовка

**Files:**
- Create: `apps/miniapp/src/lib/clubTheme.ts`, `apps/miniapp/src/styles/clubs.css` (импорт в `main.tsx` после `themes.css`)
- Modify: `apps/miniapp/src/lib/theme.ts`, `apps/miniapp/src/App.tsx` (гидратация из `me.favoriteClub` рядом с `me.theme`), `apps/miniapp/src/components/ui.tsx` (`Screen`)
- Test: `apps/miniapp/test/theme.test.ts`, `apps/miniapp/test/clubTheme.test.tsx`

**Interfaces:**
- Consumes: `clubById`, `Club`, `ClubId` (Task 1).
- Produces:
  - `lib/theme.ts`: `getClubId(): ClubId | null`, `applyClub(id: ClubId | null): void` (кэш `altynka:club`, `data-club` на `<html>`, переменные, событие `altynka:theme`), `initializeTheme()` применяет и тему, и клуб из кэша; `applyTheme()` пересчитывает переменные клуба под новую тему. `useClubId(): ClubId | null` — хук, подписанный на `altynka:theme`.
  - `lib/clubTheme.ts`: `clubVariables(club: Club, theme: AppTheme): Record<string,string>` — `--accent`, `--accent-ink`, `--on-accent`, `--accent-soft`, `--club-accent`, `--club-on-accent`, `--club-pattern`; `clubPatternCss(pattern: ClubPattern): string` (CSS-градиент: `stripes` — вертикальные полосы `repeating-linear-gradient(90deg, …)` шириной ~34 px, `hoops` — горизонтальные, `halves` — две половины, `solid` — один цвет); `materialVariables(club: Club): Record<string,string>` — `--club-hi`, `--club-mid`, `--club-base`, `--club-ink`, `--plum-ink`, `--plum-ink-strong` (для Task 5).
  - Без клуба `applyClub(null)` удаляет `data-club` и все выставленные переменные.
  - `Screen`: при клубе первым ребёнком `<main>` — `<div className="club-backdrop" aria-hidden="true">` с узором (`var(--club-pattern)`) и `<img src={club.crest} alt="">`; в `.screen-heading` после `.heading-copy`, только если нет `action`, — `<img className="club-heading-crest" src={club.crest} alt="" aria-hidden="true">`.

- [ ] **Step 1: Write failing tests:**
  - `theme.test.ts`: «cached club paints before account hydration» — `localStorage['altynka:club']='barcelona'`, `initializeTheme()` → `dataset.club==='barcelona'`, `style.getPropertyValue('--accent')` равно `clubById('barcelona').dark.accent`.
  - «switching to light recomputes club variables» — клуб barcelona, `applyTheme('light')` → `--accent` = `light.accent`.
  - «unknown cached club starts without a club» — кэш `'dinamo-zagreb'` → нет `data-club`, `--accent` пустой.
  - «clearing the club removes every variable» — `applyClub('barcelona')`, затем `applyClub(null)` → нет `data-club`, `--accent`, `--club-pattern`; кэш удалён.
  - «applyClub notifies listeners» — событие `altynka:theme` пришло.
  - `clubTheme.test.tsx`: «Screen shows backdrop and heading crest for a club» — при `applyClub('barcelona')` рендер `<Screen title="Главная">` содержит `.club-backdrop[aria-hidden=true]` и `img.club-heading-crest[src="/clubs/barcelona.svg"]`; «Screen without a club has neither»; «Screen with an action has the backdrop but no heading crest».
  - `clubPatternCss`: `stripes` с двумя цветами даёт строку с `repeating-linear-gradient(90deg` и обоими цветами; `solid` — один цвет.
- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @altynka/miniapp exec vitest run test/theme.test.ts test/clubTheme.test.tsx`.
- [ ] **Step 3: Implement** `clubTheme.ts`, расширение `theme.ts`, `Screen`, гидратацию в `App.tsx` (`useEffect(() => { if (me) applyClub(clubById(me.favoriteClub)?.id ?? null) }, [me?.favoriteClub])` — только когда `me` загружен).
- [ ] **Step 4: CSS `clubs.css`** по Global Constraints: `.club-backdrop` (absolute, top 0, высота ~300 px, `z-index` под контентом, маска вниз, узор opacity ~0,55 / ~0,3 в `[data-theme=light]`, эмблема ~150 px opacity ~0,2 по центру); `.club-heading-crest` 30×36 px; `:root[data-club] .btn.primary` → `background: var(--club-accent); color: var(--club-on-accent)`, с возвратом исходных правил внутри `.material-plum, .material-blue, .material-coral, .club-material`; `:root[data-club] .nav a.on` — подсветка иконки клубным акцентом; `:root[data-club] ::selection` и `:focus-visible` — от `--accent`; `@media (prefers-contrast: more) { .club-backdrop { display: none } }`. `main.screen` должен быть контейнером позиционирования для шапки (`position: relative`, если ещё нет) — проверить, что это не ломает существующие `sticky`/`fixed` элементы.
- [ ] **Step 5: Run, expect PASS** — `pnpm --filter @altynka/miniapp exec vitest run`, `pnpm typecheck`.
- [ ] **Step 6: Commit** — `git commit -m "miniapp: club accent, header pattern and crest"`

---

### Task 5: Карточка профиля в цвете клуба

**Files:**
- Modify: `apps/miniapp/src/components/PlayerSports.tsx`, `apps/miniapp/src/screens/Profile.tsx`, `apps/miniapp/src/screens/PlayerProfile.tsx` (и другие места, где `PlayerSportsCard` открывается шторкой профиля — найти `grep PlayerSportsCard`), `apps/miniapp/src/components/skeletons.tsx` (`PlayerSportsSkeleton`), `apps/miniapp/src/styles/clubs.css`
- Test: `apps/miniapp/test/PlayerSports.test.tsx`, `apps/miniapp/test/PlayerProfile.test.tsx`

**Interfaces:**
- Consumes: `clubById` (Task 1), `materialVariables`, `getClubId` (Task 4), `MeDto.favoriteClub`, `PlayerProfileDto.favoriteClub` (Task 2).
- Produces: `PlayerSportsCard` prop `favoriteClub?: ClubId | null`. С клубом: класс `club-material` вместо `material-plum`, `style` = `materialVariables(club)`, `<img className="player-club-crest" src={club.crest} alt={`Любимый клуб: ${club.name}`}>` в правом верхнем углу. `.club-material` в CSS — рецепт `.material-plum` на `--club-hi/--club-mid/--club-base`, цвет текста `--club-ink`.

- [ ] **Step 1: Write failing tests:**
  - `PlayerSports.test.tsx`: «favourite club paints the card and shows the crest» — `favoriteClub="barcelona"` → секция имеет `club-material`, не имеет `material-plum`, `style` содержит `--club-mid` равный `clubById('barcelona').material.mid`, есть `img` с alt «Любимый клуб: Барселона».
  - «no club keeps plum» — без prop и с `favoriteClub={null}` → `material-plum`, нет `img` эмблемы.
  - «unknown club keeps plum» — `favoriteClub={'dinamo-zagreb' as ClubId}` → `material-plum`.
  - `PlayerProfile.test.tsx`: «peer profile uses the owner's club, not the viewer's» — `applyClub('real-madrid')` у смотрящего, ответ профиля `favoriteClub:'barcelona'` → карточка с alt «Любимый клуб: Барселона».
- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @altynka/miniapp exec vitest run test/PlayerSports.test.tsx test/PlayerProfile.test.tsx`.
- [ ] **Step 3: Implement** prop и CSS; `Profile.tsx` передаёт `me.favoriteClub`, `PlayerProfile.tsx` — `data.favoriteClub`; `PlayerSportsSkeleton` берёт клуб из `getClubId()` для своего профиля (тот же класс и переменные), чтобы цвет не прыгал. Если каркас общий для своего и чужого профиля — клуб из кэша только в каркасе своего профиля (`/profile`).
- [ ] **Step 4: Run, expect PASS** — весь miniapp vitest, `pnpm typecheck`.
- [ ] **Step 5: Commit** — `git commit -m "miniapp: profile card in the favourite club's colour"`

---

### Task 6: Шторка «Любимый клуб»

**Files:**
- Create: `apps/miniapp/src/components/ClubPicker.tsx`
- Modify: `apps/miniapp/src/App.tsx` (маршрут `/profile/club` → `<Profile club />`, рядом с `/profile/availability`), `apps/miniapp/src/screens/Profile.tsx` (prop `club`, строка в «Настройка профиля», шторка), `apps/miniapp/src/styles/clubs.css`
- Test: `apps/miniapp/test/ClubPicker.test.tsx`, `apps/miniapp/test/Profile.test.tsx`

**Interfaces:**
- Consumes: `CLUBS`, `CLUB_LEAGUES`, `CLUB_LEAGUE_LABEL`, `clubById` (Task 1), `applyClub`, `getClubId` (Task 4), `ActionSheet`, `api.send`, `useMe`/`useUpdateMe`, `useToast`, `haptic`.
- Produces: `ClubPickerSheet({ onClose }: { onClose: () => void })`. Строка в `Profile`: `Link` `/profile/club`, `card task-preview material-graphite`, иконка из `Icon` (например `shirt`), `<b>Любимый клуб</b><small>{название | 'Не выбран'}</small>`, шеврон — как соседние строки; ставится после «Изменить оплату».

Поведение шторки:
- `ActionSheet title="Любимый клуб"`; переключатель «Клубы | Сборные» — `role="tablist"`/`tab` с `aria-selected` (как существующие `.tabs`).
- У «Клубов» — ряд чипов `.club-leagues` (Все + 6 лиг, кнопки с `aria-pressed`), прокручивается вбок; у «Сборных» чипов нет.
- Строка «Без клуба» / «Обычная тема» — кнопка с `aria-pressed` при отсутствии клуба.
- Сетка `.club-grid` 3 колонки, плитка — `button` с `aria-pressed`, `<img loading="lazy" alt="">` + название; «Все» — лиги по порядку `CLUB_LEAGUES`.
- Подпись «Список клубов будет пополняться».
- Открытие: раздел текущего клуба (сборная → «Сборные»; клуб → «Клубы» + его лига), иначе «Клубы» + «Все».
- Нажатие: `applyClub(next)`, `updateMe` оптимистично, `onClose()`, `PATCH /api/me {favoriteClub: next}`; модульный счётчик операций как `latestThemeOperation` в `SystemSettings.tsx` — устаревший ответ/ошибка игнорируются; ошибка последней операции → `applyClub(previous)`, `updateMe` назад, тост «Не получилось сохранить клуб» (`tone: 'error'`). Успех — `haptic('success')`.

- [ ] **Step 1: Write failing tests** (`ClubPicker.test.tsx`, `api.send` замокан):
  - «opens on clubs/all without a club and lists every club tile» — 20 плиток клубов, сборных нет; есть «Список клубов будет пополняться».
  - «league chip filters» — нажать «Ла Лига» → ровно Реал Мадрид, Барселона, Атлетико.
  - «national teams tab has no league chips» — «Сборные» → 5 плиток, нет чипа «АПЛ».
  - «opens on the current club's section» — клуб `kairat` → активен «КПЛ», плитка «Кайрат» `aria-pressed=true`; клуб `brazil` → активна вкладка «Сборные».
  - «choosing applies at once, closes and saves» — нажать «Барселона» → `getClubId()==='barcelona'` до резолва запроса, `onClose` вызван, `api.send` вызван с `('PATCH','/api/me',{favoriteClub:'barcelona'})`.
  - «Без клуба saves null».
  - «failure rolls back to the previous club with a toast» — было `kairat`, выбрать `barcelona`, `api.send` reject → `getClubId()==='kairat'`, тост показан.
  - «a stale failure does not undo a newer choice» — первый запрос (barcelona) висит, второй (milan) успешен, затем первый падает → остаётся `milan`.
  - `Profile.test.tsx`: строка «Любимый клуб» с подписью «Не выбран» / «Барселона»; ссылка ведёт на `/profile/club`.
- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @altynka/miniapp exec vitest run test/ClubPicker.test.tsx test/Profile.test.tsx`.
- [ ] **Step 3: Implement** компонент, маршрут, строку; стили сетки и чипов (чипы — существующий вид `.chip-btn`, если подходит).
- [ ] **Step 4: Run, expect PASS** — весь miniapp vitest, `pnpm typecheck`.
- [ ] **Step 5: Commit** — `git commit -m "miniapp: favourite club picker sheet"`

---

### Task 7: Playwright и документация

**Files:**
- Create: `tests/ui/club-theme.spec.ts`
- Modify: `tests/ui/fixtures.ts` (`.club-leagues` в `HORIZONTAL_SCROLLERS`), `tests/ui/horizontal-scroll.spec.ts` (шторка клуба на 320 px, если этот спек обходит шторки списком), `tests/ui/skeletons.spec.ts` (каркас профиля с клубом), `DESIGN.md`, `README.md`

**Interfaces:**
- Consumes: всё выше; API замокано, `me.favoriteClub` в фикстуре.

- [ ] **Step 1: Write the spec** `club-theme.spec.ts` (импорт `test`/`expect` из `./fixtures`):
  - «picking a club recolours the app and the profile card» — `/profile`, «Любимый клуб» → шторка → «Барселона» → PATCH ушёл с `favoriteClub:'barcelona'`; `html[data-club=barcelona]`; `.club-backdrop` и `.club-heading-crest` видимы; карточка профиля `.club-material`.
  - «light and dark with a light club (real-madrid) and a yellow club (kairat)» — для каждого сочетания axe без нарушений контраста на `/` и `/profile`, скриншоты в `artifacts/ui/club-*.png`.
  - «320 px: picker with long names has no sideways scroll» — ширина 320, вкладка «Клубы»/«Все», затем «Бундеслига».
  - «peer profile shows the owner's club» — `/api/players/:id` с `favoriteClub:'barcelona'` при своём `real-madrid`.
  - «no club looks as before» — без `favoriteClub` нет `.club-backdrop`, карточка `.material-plum`.
  - Нарушения CSP ловит фикстура автоматически.
- [ ] **Step 2: Run** — `pnpm build && pnpm exec playwright test tests/ui/club-theme.spec.ts tests/ui/horizontal-scroll.spec.ts tests/ui/skeletons.spec.ts`; ожидание: PASS. Затем полный `pnpm test:ui`.
- [ ] **Step 3: DESIGN.md** (по-английски, как остальной файл): в абзаце о сплошном фоне — исключение для клубной шапки; новый абзац «Favourite club»: что красит клубный цвет и что нет, шапка (высота, прозрачности, маска, скрытие при повышенной контрастности), эмблема у заголовка (только без `action`), клубный материал карточки профиля (один для обеих тем, эмблема в углу, подпись для диктора), шторка (вкладки, чипы, «Без клуба», сетка 3 в ряд, подпись), строка в «Настройка профиля».
- [ ] **Step 4: README.md** — раздел «Любимый клуб»: что видит игрок и другие; как добавить клуб (запись в `packages/core/src/clubs.ts`, файл `apps/miniapp/public/clubs/<id>.svg` ≤ 30 КБ, тест контраста должен пройти, новый вид узора — только через код `clubPatternCss`).
- [ ] **Step 5: Полная проверка** — `pnpm test`, `pnpm typecheck`, `pnpm test:migrations`, `pnpm test:ui`; всё зелёное.
- [ ] **Step 6: Commit** — `git commit -m "test+docs: club themes"`

---

## После плана (не задачи исполнителей)

- Показать пользователю эмблемы (какие настоящие, какие заглушки).
- Staging — только по команде пользователя (заменит таймер). Production — `pnpm backup`, `pnpm release`, запись `docs/club-themes-deployment.md`; перед этим согласовать номер миграции с веткой таймера.
