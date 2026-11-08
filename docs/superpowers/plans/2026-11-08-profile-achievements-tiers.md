# Достижения с уровнями и упрощённые сыгранные матчи — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить в профиле сетку достижений на графитовую карточку с закреплённым достижением, шторкой всех достижений и лестницей из 7 уровней, а список сыгранных матчей — на компактную графитовую карточку с тремя строками.

**Architecture:** Лестницы и расчёт уровней — чистая логика в `packages/core` (новый `achievements.ts`). Закреплённое достижение — колонка `users.pinned_achievement`, пишется через существующий `PATCH /api/me` и отдаётся в `PlayerProfileDto`. Мини-апп рисует карточку и шторки на общем `ActionSheet`; после `PATCH /api/me` профиль перезапрашивается сам (правило `PERSON_WRITE` в `lib/queryClient.ts`).

**Tech Stack:** TypeScript, React 19, TanStack Query, Hono + zod, Drizzle/D1, vitest (workers pool, happy-dom), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-profile-achievements-tiers-design.md`

## Global Constraints

- Весь пользовательский текст на русском.
- Уровни строго по порядку: Дерево, Бронза, Серебро, Золото, Платина, Алмаз, Легенда. Всего 5 лестниц × 7 = 35 уровней.
- Пороги — из таблицы спеки (повторены в Task 1). Порядок лестниц: `scorer`, `winner`, `rhythm`, `veteran`, `hat-trick`.
- Карточки — `card material-graphite` (30 px углы). Никаких плоских фонов, никаких цветных свечений (`box-shadow` с цветом и размытием) у медалей.
- Уровень всегда подписан текстом, цвет не единственный носитель смысла. Текст на обеих темах — контраст WCAG AA (axe в Playwright).
- Нажимаемые элементы ≥44 px, primary-кнопка 48 px. Числа — `font-variant-numeric: tabular-nums`.
- Импорты относительные, без алиасов; при переносе компонента обновить импорты и `vi.mock` в тестах.

## Review Focus

1. Чужой профиль, где закреплённое достижение для зрителя имеет уровень 0 (общих групп мало) — карточка показывает его закрытым («Не открыто», прогресс до Дерева), а не пустое место и не падение. Тест — Task 3.
2. Взята Легенда (`nextTarget === null`) — «Максимальный уровень», полная полоса, нет `NaN`/деления на null. Тесты — Task 1 и Task 3.
3. Ошибка запроса закрепления — текст ошибки под кнопкой, кнопка снова активна, карточка не меняется. Тест — Task 3.
4. Ровно 3 матча — ссылки «Все» нет; 0 матчей — пустое состояние внутри графитовой карточки. Тест — Task 4.
5. С сервера пришёл неизвестный id закреплённого (старое значение) — показываем пустое место, а не падаем. Тест — Task 3.

---

### Task 1: Лестницы достижений в core

**Files:**
- Create: `packages/core/src/achievements.ts`
- Modify: `packages/core/src/playerStatistics.ts` (добавить `hatTricks`, удалить старую `playerAchievements`)
- Modify: `packages/core/src/index.ts` (добавить `export * from './achievements';`)
- Test: `packages/core/test/achievements.test.ts` (новый), `packages/core/test/playerStatistics.test.ts` (обновить)

**Interfaces:**
- Produces:
  ```ts
  export const ACHIEVEMENT_IDS = ['scorer','winner','rhythm','veteran','hat-trick'] as const;
  export type AchievementId = typeof ACHIEVEMENT_IDS[number];
  export const ACHIEVEMENT_TIERS = ['wood','bronze','silver','gold','platinum','diamond','legend'] as const;
  export type AchievementTier = typeof ACHIEVEMENT_TIERS[number];
  export const ACHIEVEMENT_TIER_LABEL: Record<AchievementTier,string>;   // 'Дерево' … 'Легенда'
  export const ACHIEVEMENT_TIER_TO: Record<AchievementTier,string>;      // 'До дерева','До бронзы','До серебра','До золота','До платины','До алмаза','До легенды'
  export const ACHIEVEMENT_TOTAL_LEVELS = 35;
  export type AchievementSymbol = 'ball'|'trophy'|'shirt'|'shield'|'flame';
  export interface PlayerAchievement {
    id: AchievementId; title: string; metric: string; unit: readonly [string,string,string];
    symbol: AchievementSymbol; current: number; thresholds: readonly number[];
    level: number;                       // 0..7, 0 = закрыто
    tier: AchievementTier | null;        // null при level 0
    nextTier: AchievementTier | null;    // null на Легенде
    nextTarget: number | null;           // null на Легенде
  }
  export function playerAchievements(stats: PlayerStatistics): PlayerAchievement[];
  export function isAchievementId(value: unknown): value is AchievementId;
  export function unlockedLevels(rows: readonly PlayerAchievement[]): number; // сумма level
  ```
  `PlayerStatistics` получает поле `hatTricks: number`.

Данные лестниц (точные значения):

| id | title | metric | unit | symbol | current из stats | thresholds |
|---|---|---|---|---|---|---|
| scorer | Бомбардир | Голы за всё время | гол/гола/голов | ball | goals | 1,10,25,50,100,250,500 |
| winner | Победитель | Победы в коротких играх | победа/победы/побед | trophy | wins | 1,10,25,50,100,250,500 |
| rhythm | В ритме игры | Сыгранные короткие игры | игра/игры/игр | shirt | games | 5,25,50,100,250,500,1000 |
| veteran | Ветеран | Сыгранные встречи | встреча/встречи/встреч | shield | meetings | 1,5,10,25,50,100,200 |
| hat-trick | Хет-трик | Встречи с 3+ голами | хет-трик/хет-трика/хет-триков | flame | hatTricks | 1,3,5,10,20,35,50 |

- [ ] **Step 1: Write the failing tests** в `packages/core/test/achievements.test.ts`:

```ts
import * as core from '../src';
const stats = (p: Partial<core.PlayerStatistics> = {}) => ({ ...core.aggregatePlayerStatistics([]), ...p });

test('ladders keep the spec order and seven thresholds each', () => {
  const rows = core.playerAchievements(stats());
  expect(rows.map(r => r.id)).toEqual(['scorer','winner','rhythm','veteran','hat-trick']);
  expect(rows.find(r => r.id === 'rhythm')!.thresholds).toEqual([5,25,50,100,250,500,1000]);
  expect(rows.every(r => r.thresholds.length === 7)).toBe(true);
});
test('a fresh player has every ladder closed with the first threshold as target', () => {
  const scorer = core.playerAchievements(stats())[0];
  expect(scorer).toMatchObject({ current: 0, level: 0, tier: null, nextTier: 'wood', nextTarget: 1 });
});
test('64 goals is gold heading to platinum at 100', () => {
  expect(core.playerAchievements(stats({ goals: 64 }))[0]).toMatchObject({ level: 4, tier: 'gold', nextTier: 'platinum', nextTarget: 100 });
});
test('reaching a threshold exactly unlocks that tier', () => {
  expect(core.playerAchievements(stats({ meetings: 5 })).find(r => r.id === 'veteran')).toMatchObject({ level: 2, tier: 'bronze', nextTarget: 10 });
});
test('legend has no next target', () => {
  expect(core.playerAchievements(stats({ goals: 900 }))[0]).toMatchObject({ level: 7, tier: 'legend', nextTier: null, nextTarget: null });
});
test('hat-trick ladder reads hatTricks and unlocked levels sum across ladders', () => {
  const rows = core.playerAchievements(stats({ hatTricks: 3, goals: 10 }));
  expect(rows.find(r => r.id === 'hat-trick')).toMatchObject({ level: 2, tier: 'bronze' });
  expect(core.unlockedLevels(rows)).toBe(4);
  expect(core.ACHIEVEMENT_TOTAL_LEVELS).toBe(35);
});
test('isAchievementId rejects unknown values', () => {
  expect(core.isAchievementId('scorer')).toBe(true);
  expect(core.isAchievementId('sniper')).toBe(false);
  expect(core.isAchievementId(null)).toBe(false);
});
```

  В `playerStatistics.test.ts`: в ожидаемом объекте теста `aggregate counts meetings once…` добавить `hatTricks:1` (встреча `b` с 4 голами; встреча `a` с 2 голами не считается). Удалить тест `a hat-trick achievement requires three goals in the same meeting` (старая модель).

- [ ] **Step 2: Run, verify failure**

Run: `pnpm --filter @altynka/core exec vitest run test/achievements.test.ts test/playerStatistics.test.ts`
Expected: FAIL (`playerAchievements` возвращает старые строки, `hatTricks` нет).

- [ ] **Step 3: Implement** `achievements.ts` по Interfaces и таблице; `level` = число порогов `<= current`. В `aggregatePlayerStatistics` инициализировать `hatTricks: 0` и увеличивать для каждой встречи с `row.goals >= 3`. Удалить старую `playerAchievements` из `playerStatistics.ts`.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @altynka/core exec vitest run && pnpm --filter @altynka/core exec tsc --noEmit`
Expected: PASS. (`pnpm typecheck` во всём репо упадёт на мини-аппе, использующем старые поля, — это чинит Task 3.)

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): tiered achievement ladders and hat-trick count"
```

---

### Task 2: Закреплённое достижение на сервере

**Files:**
- Create: `apps/worker/migrations/0013_pinned_achievement.sql`
- Modify: `apps/worker/migrations/meta/_journal.json` (запись `idx: 13`, `tag: "0013_pinned_achievement"`, `when: 1794150000000`, `version: "6"`, `breakpoints: true`)
- Modify: `apps/worker/src/db/schema.ts` (`users`)
- Modify: `apps/worker/src/api/members.ts` (`profileDetails`, `PATCH /me`)
- Modify: `apps/worker/src/domain/ratings.ts` (`playerProfile`)
- Modify: `apps/worker/src/domain/playerStatistics.ts` (убрать `.slice(0,20)`)
- Modify: `packages/core/src/api.ts` (`MeDto`), `packages/core/src/ratings.ts` (`PlayerProfileDto`)
- Test: `apps/worker/test/api/profile.test.ts`, `apps/worker/test/api/ratings.test.ts`

**Interfaces:**
- Consumes: `ACHIEVEMENT_IDS`, `AchievementId` из Task 1.
- Produces: `MeDto.pinnedAchievement?: AchievementId | null`; `PlayerProfileDto.pinnedAchievement: AchievementId | null`; `PATCH /api/me` принимает `pinnedAchievement: AchievementId | null`; `PlayerProfileDto.gameHistory` содержит все встречи без лимита.

- [ ] **Step 1: Write the failing tests**

  В `profile.test.ts`:
  ```ts
  test('pinned achievement persists, clears and rejects unknown ids', async () => {
    expect(await get()).toMatchObject({ pinnedAchievement: null });
    expect((await patch({ pinnedAchievement: 'scorer' })).status).toBe(200);
    expect(await get()).toMatchObject({ pinnedAchievement: 'scorer' });
    expect((await patch({ pinnedAchievement: 'sniper' })).status).toBe(400);
    expect(await get()).toMatchObject({ pinnedAchievement: 'scorer' });
    await patch({ pinnedAchievement: null });
    expect(await get()).toMatchObject({ pinnedAchievement: null });
  });
  ```
  В `ratings.test.ts` (рядом с тестами `/api/players/:id`): игрок закрепляет `winner` через `PATCH /api/me` от своего имени; организатор той же группы запрашивает `/api/players/${w.playerUserId}` и получает `pinnedAchievement: 'winner'`.

- [ ] **Step 2: Run, verify failure**

Run: `pnpm --filter @altynka/worker exec vitest run test/api/profile.test.ts test/api/ratings.test.ts`
Expected: FAIL (поля нет).

- [ ] **Step 3: Implement**
  - Миграция: `ALTER TABLE users ADD COLUMN pinned_achievement text;`
  - Схема: `pinnedAchievement: text('pinned_achievement', { enum: ['scorer','winner','rhythm','veteran','hat-trick'] })` (литералом, как соседние enum-колонки).
  - `members.ts`: поле `pinnedAchievement: z.enum(ACHIEVEMENT_IDS).nullable().optional()` в схеме `PATCH /me`, запись в `set`, отдача в `profileDetails`.
  - `playerProfile`: добавить `pinnedAchievement` в существующий `select` из `users` и в возвращаемый объект (`?? null`).
  - `playerGameStatistics`: `gameHistory: history`.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @altynka/worker exec vitest run && pnpm --filter @altynka/worker exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker packages/core/src/api.ts packages/core/src/ratings.ts
git commit -m "feat(worker): store and expose the pinned achievement"
```

---

### Task 3: Карточка достижений и шторки в мини-аппе

**Files:**
- Create: `apps/miniapp/src/components/PlayerAchievements.tsx`
- Create: `apps/miniapp/src/styles/achievements.css` (импорт в `app.css` рядом с `player-statistics.css`)
- Modify: `apps/miniapp/src/components/PlayerSports.tsx` (удалить старый `PlayerAchievements` и импорт `playerAchievements`)
- Modify: `apps/miniapp/src/styles/player-statistics.css` (удалить все правила `.achievement*`, включая светлую тему и `@media(max-width:359px)`)
- Modify: `apps/miniapp/src/screens/Profile.tsx`, `apps/miniapp/src/screens/PlayerProfile.tsx`
- Test: `apps/miniapp/test/PlayerAchievements.test.tsx` (новый)

**Interfaces:**
- Consumes: `playerAchievements`, `isAchievementId`, `unlockedLevels`, `ACHIEVEMENT_TOTAL_LEVELS`, `ACHIEVEMENT_TIER_LABEL`, `ACHIEVEMENT_TIER_TO`, `plural` из core; `PlayerProfileDto.pinnedAchievement` из Task 2.
- Produces:
  ```ts
  export function PlayerAchievements(props: {
    statistics: PlayerStatistics;
    pinned: AchievementId | null;            // неизвестный id → считать null
    onPin?: (id: AchievementId) => Promise<void>;  // есть только в своём профиле
  }): JSX.Element;
  export function AchievementMedal(props: { tier: AchievementTier | null; symbol: AchievementSymbol; size: 'lg' | 'md' | 'sm' }): JSX.Element; // декоративная, aria-hidden
  ```
  `Profile.tsx`: `onPin = id => api.send('PATCH','/api/me',{ pinnedAchievement: id })` (профиль перезапросится сам — `PERSON_WRITE`). `PlayerProfile.tsx`: без `onPin`.

Поведение и тексты (точно из спеки):
- Секция `aria-labelledby` с заголовком «Достижения» (h2), справа кнопка «Все 5 ›» (`aria-label="Все достижения"`), открывает шторку.
- Закреплено: медаль `lg` (76 px, 60 px при <360 px), «Закреплено», название, строка `${ACHIEVEMENT_TIER_LABEL[tier]} · ${current} ${plural(current,...unit)}`, полоса прогресса (`<progress>` от предыдущего порога до `nextTarget`), строка `${ACHIEVEMENT_TIER_TO[nextTier]}` + `current / nextTarget`. Закрыто: серая медаль, «Не открыто», прогресс до Дерева. Легенда: «Максимальный уровень», полная полоса. Ряд медаль+текст — кнопка, открывает шторку одного достижения.
- Пусто (нет закреплённого): пустой шестиугольный контур того же размера, без иконки. Своё: текст «Закрепи достижение, чтобы его видели другие», ряд — кнопка, открывает список. Чужое: «Ничего не закреплено», не кнопка.
- Шторка списка: `ActionSheet title="Достижения" description={\`Уровней открыто: ${unlockedLevels(rows)} из 35\`}`. Строки-кнопки: медаль `md` (48 px), название, метка «в профиле» у закреплённого, название уровня (или «Не открыто»), справа `current / nextTarget` (на Легенде — просто `current`).
- Вложенная шторка одного достижения: `ActionSheet title={title}`: медаль `lg`, `${metric} · ${current}`, список из 7 уровней (медаль `sm` 28 px, название, порог); пройденные — обычные, текущий с пометкой «· сейчас», будущие — приглушены, но AA. В футере primary-кнопка, только при `onPin`: «Закрепить в профиле»; «Закреплено в профиле ✓» (disabled) если это закреплённое; «Откроется на первом уровне» (disabled) при `level 0`; «Закрепляем…» во время запроса (`busy` у `ActionSheet`). Ошибка — `role="alert"` «Не получилось закрепить. Попробуй ещё раз.» под кнопкой.
- Цвета медалей — градиенты из мокапа (`.superpowers/brainstorm/*/content/achievements.html`, классы `.wood … .legend`), шестиугольник через `clip-path: polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%)`. Цвет строки уровня — отдельный токен на уровень, подобранный под AA на графите обеих тем (`data-tier` на элементе).

- [ ] **Step 1: Write the failing tests** в `PlayerAchievements.test.tsx` (helper `renderWithApp` из `./render`):

```ts
const stats = (p = {}) => ({ ...aggregatePlayerStatistics([]), ...p });
test('pinned gold scorer shows tier, progress to platinum and opens its ladder', async () => {
  renderWithApp(<PlayerAchievements statistics={stats({ goals: 64 })} pinned="scorer" onPin={vi.fn()}/>, { me: player });
  expect(screen.getByText('Золото · 64 гола')).toBeInTheDocument();
  expect(screen.getByText('До платины')).toBeInTheDocument();
  expect(screen.getByText('64 / 100')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Бомбардир/ }));
  expect(screen.getByRole('dialog', { name: 'Бомбардир' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Закреплено в профиле ✓' })).toBeDisabled();
});
test('own empty slot invites pinning and opens the list; peer empty slot is inert', async () => {
  const { unmount } = renderWithApp(<PlayerAchievements statistics={stats()} pinned={null} onPin={vi.fn()}/>, { me: player });
  await userEvent.click(screen.getByRole('button', { name: /Закрепи достижение/ }));
  expect(screen.getByRole('dialog', { name: 'Достижения' })).toHaveTextContent('Уровней открыто: 0 из 35');
  unmount();
  renderWithApp(<PlayerAchievements statistics={stats()} pinned={null}/>, { me: player });
  expect(screen.getByText('Ничего не закреплено').closest('button')).toBeNull();
});
test('unknown pinned id renders the empty slot', () => {
  renderWithApp(<PlayerAchievements statistics={stats()} pinned={'sniper' as never}/>, { me: player });
  expect(screen.getByText('Ничего не закреплено')).toBeInTheDocument();
});
test('peer view of a pinned ladder that is closed for the viewer shows it locked', () => {
  renderWithApp(<PlayerAchievements statistics={stats()} pinned="winner"/>, { me: player });
  expect(screen.getByText('Победитель')).toBeInTheDocument();
  expect(screen.getByText('Не открыто')).toBeInTheDocument();
});
test('legend shows the maximum level with a full bar', () => {
  renderWithApp(<PlayerAchievements statistics={stats({ goals: 600 })} pinned="scorer"/>, { me: player });
  expect(screen.getByText('Максимальный уровень')).toBeInTheDocument();
  const bar = screen.getByRole('progressbar');
  expect(bar).toHaveAttribute('value', bar.getAttribute('max'));
});
test('pinning calls onPin with the id; level 0 cannot be pinned; peers see no pin button', async () => {
  const onPin = vi.fn().mockResolvedValue(undefined);
  renderWithApp(<PlayerAchievements statistics={stats({ wins: 12 })} pinned="scorer" onPin={onPin}/>, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Все достижения' }));
  await userEvent.click(screen.getByRole('button', { name: /Победитель/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Закрепить в профиле' }));
  expect(onPin).toHaveBeenCalledWith('winner');
});
test('closed ladder offers a disabled pin button', async () => {
  renderWithApp(<PlayerAchievements statistics={stats()} pinned={null} onPin={vi.fn()}/>, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Все достижения' }));
  await userEvent.click(screen.getByRole('button', { name: /Хет-трик/ }));
  expect(screen.getByRole('button', { name: 'Откроется на первом уровне' })).toBeDisabled();
});
test('a failed pin shows an error and keeps the button usable', async () => {
  const onPin = vi.fn().mockRejectedValue(new Error('network'));
  renderWithApp(<PlayerAchievements statistics={stats({ wins: 12 })} pinned={null} onPin={onPin}/>, { me: player });
  await userEvent.click(screen.getByRole('button', { name: 'Все достижения' }));
  await userEvent.click(screen.getByRole('button', { name: /Победитель/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Закрепить в профиле' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не получилось закрепить. Попробуй ещё раз.');
  expect(screen.getByRole('button', { name: 'Закрепить в профиле' })).toBeEnabled();
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm --filter @altynka/miniapp exec vitest run test/PlayerAchievements.test.tsx`
Expected: FAIL (модуля нет).

- [ ] **Step 3: Implement** компонент, стили и подключение в `Profile.tsx` (`pinned={sportingProfile.data.pinnedAchievement}`, `onPin`) и `PlayerProfile.tsx` (`pinned={data.pinnedAchievement}`). Светлая тема и повышенный контраст — по образцу соседних графитовых карточек в `themes.css`/`app.css`.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @altynka/miniapp exec vitest run && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp
git commit -m "feat(miniapp): pinned achievement card with tier ladders"
```

---

### Task 4: Компактные сыгранные матчи

**Files:**
- Modify: `apps/miniapp/src/components/PlayerGameHistory.tsx`
- Modify: `apps/miniapp/src/styles/player-statistics.css` (заменить `.player-meeting`, `.player-meeting-date`, `.session-totals`, `.history-results`, `.session-rating`, `.history-link` новыми правилами строк)
- Test: `apps/miniapp/test/PlayerSports.test.tsx`

**Interfaces:**
- Consumes: `PlayerProfileDto.gameHistory` (полный, Task 2), `formatDateRu`, `plural`, `GroupTag`, `ActionSheet`.
- Produces: внутренний `MeetingRow({ meeting, showGroup, onOpen }: { meeting: PlayerMeetingStatistics; showGroup: boolean; onOpen: () => void })`. Внешний API `PlayerGameHistory({profile})` не меняется.

Поведение:
- Секция `card material-graphite player-meeting-history` с h2 «Сыгранные матчи»; кнопка `Все ${meetings.length} ›` справа (`aria-label="Все сыгранные матчи"`) только при `meetings.length > 3`.
- В карточке `meetings.slice(0,3)`. Строка — `<button>` высотой ≥58 px: слева дата `formatDateRu`, ряд точек `aria-hidden` (по одной на `results` в порядке `sequence`, `data-outcome` = win/draw/loss; цвета: победа `#a8c7b1`, ничья нейтральная серая, поражение розовая, все AA-различимые от фона как не-текстовые элементы 3:1), под датой `GroupTag`, только если среди `profile.gameHistory` больше одного `community.id`; справа `${goals} ${plural(goals,'гол','гола','голов')}` с числом акцентом; шеврон. Доступное имя строки: `${дата}: ${goals} ${гол…}, победы ${wins}, ничьи ${draws}, поражения ${losses}`.
- Нажатие на строку — существующая шторка коротких игр. Её верхняя строка: `${displayName} · Игр: ${games} · Голов: ${goals}` + ` · Оценка ${score с запятой}` если `score !== null`; место отдельной строкой `muted`, если есть.
- «Все N ›» → `ActionSheet title="Сыгранные матчи"` с теми же строками для всех матчей; строка открывает шторку коротких игр поверх.
- Пустое состояние «Всё начнётся с первой игры» / «Здесь появятся сыгранные матчи, результаты и забитые голы.» — внутри той же графитовой карточки, без кнопки «Все».
- `RatingHistory` для старых протоколов остаётся под карточкой без изменений.

- [ ] **Step 1: Write the failing tests** в `PlayerSports.test.tsx` (фабрика `meeting(eventId, date, results, communityId=1)` строит `PlayerMeetingStatistics` с `goals` = сумма голов):

```ts
test('the card lists the latest three meetings as rows with dots and goals', async () => {
  renderWithApp(<PlayerGameHistory profile={profileWith([m1, m2, m3, m4])}/>, { me: player });
  const rows = screen.getAllByRole('button', { name: /гол/ });
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveAccessibleName(/3 гола, победы 2, ничьи 1, поражения 0/);
  expect(document.querySelectorAll('.player-meeting-row [data-outcome]')).toHaveLength(3); // в первой строке 3 игры
  await userEvent.click(screen.getByRole('button', { name: 'Все сыгранные матчи' }));
  expect(screen.getByRole('dialog', { name: 'Сыгранные матчи' }).querySelectorAll('button.player-meeting-row')).toHaveLength(4);
});
test('exactly three meetings have no "all" link and a single group hides group tags', () => {
  renderWithApp(<PlayerGameHistory profile={profileWith([m1, m2, m3])}/>, { me: player });
  expect(screen.queryByRole('button', { name: 'Все сыгранные матчи' })).toBeNull();
  expect(document.querySelector('.player-meeting-row .group-tag')).toBeNull();
});
test('no meetings shows the empty state inside the graphite card', () => {
  renderWithApp(<PlayerGameHistory profile={profileWith([])}/>, { me: player });
  expect(screen.getByText('Всё начнётся с первой игры').closest('.material-graphite')).not.toBeNull();
});
test('the short-games sheet carries the rating and place removed from the row', async () => {
  renderWithApp(<PlayerGameHistory profile={profileWith([{ ...m1, score: 8.2, place: 'Школа Аксай' }])}/>, { me: player });
  await userEvent.click(screen.getAllByRole('button', { name: /гол/ })[0]);
  const sheet = screen.getByRole('dialog');
  expect(sheet).toHaveTextContent('Оценка 8,2');
  expect(sheet).toHaveTextContent('Школа Аксай');
});
```
  Существующий тест `old protocol meetings do not resurface…` оставить.

- [ ] **Step 2: Run, verify failure**

Run: `pnpm --filter @altynka/miniapp exec vitest run test/PlayerSports.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** по описанию выше. Класс строки — `player-meeting-row`; точки переносятся на новую строку при нехватке ширины (`flex-wrap`), горизонтального скролла нет.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @altynka/miniapp exec vitest run && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp
git commit -m "feat(miniapp): compact played-meetings card"
```

---

### Task 5: Playwright и DESIGN.md

**Files:**
- Modify: `tests/ui/player-statistics.spec.ts`
- Modify: `DESIGN.md` (абзац «An inset panel contains the position…», фраза «Achievements and played meetings follow the card…»)

**Interfaces:**
- Consumes: всё из Task 3 и 4.

- [ ] **Step 1: Update the spec**
  - В фикстуре `statistics` добавить `hatTricks:1`, в `profile` — `pinnedAchievement:'scorer'`; добавить ещё три встречи в `gameHistory` (итого 4), чтобы появилась «Все 4».
  - В тесте `complete sports profile ${theme} ${width}` заменить проверки `.player-meeting` / «Все короткие игры (3)» на: видна секция «Достижения» с текстом «Бомбардир» и «Дерево · 3 гола»; `.player-meeting-row` в карточке — 3; клик по первой строке открывает шторку с `.player-short-game` ×3 и «0:2» в первой; закрыть; клик «Все сыгранные матчи» → 4 строки; закрыть; клик «Все достижения» → диалог «Достижения» с «Уровней открыто:»; клик «Бомбардир» → вложенный диалог с 7 уровнями; закрыть оба. `scrollWidth<=innerWidth` и axe (390) остаются и прогоняются после открытия шторки достижений тоже.
  - Новый тест: `PATCH /api/me` с `{pinnedAchievement:'winner'}` уходит при нажатии «Закрепить в профиле» в шторке «Победитель» (перехват `page.route` по методу PATCH, проверка тела).
  - В тесте peer profile: `pinnedAchievement:null` → видно «Ничего не закреплено», нет кнопки «Закрепить в профиле» в шторке достижения.

- [ ] **Step 2: Run**

Run: `pnpm test:ui -- tests/ui/player-statistics.spec.ts`
Expected: PASS на всех проектах (Chromium + mobile WebKit), 0 нарушений axe.

- [ ] **Step 3: Update DESIGN.md** — описать: графитовая карточка «Достижения» с одним закреплённым (или пустым шестиугольным местом), «Все 5 ›» → шторка списка → вложенная шторка лестницы из 7 уровней с закреплением только в своём профиле; графитовая карточка «Сыгранные матчи» с тремя строками (дата, точки коротких игр, голы), «Все N ›» при >3, оценка и место — в шторке коротких игр. Убрать устаревшую фразу про дату в заголовке каждой карточки встречи.

- [ ] **Step 4: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm test:ui`
Expected: всё PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/ui/player-statistics.spec.ts DESIGN.md
git commit -m "test(ui): achievements and played meetings; document in DESIGN.md"
```

---

## Вне плана

Выкладка в прод — отдельно по CLAUDE.md: `wrangler d1 migrations apply fc-altynka --remote` для `0013` **до** `pnpm run deploy`, затем `docs/<feature>-deployment.md`.
