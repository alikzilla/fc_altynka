# Страница матча: «Игры», монета, «Составы», ассисты — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать спецификацию: вкладка «Игры» на материалах Airofit, жеребьёвка монетой 200 тенге, новый редактор и вид составов, ассисты у каждого гола.

**Architecture:** Ассисты хранятся в JSON состояния игры как пары «автор → ассистент → голов» (`GameAssist[]`) рядом с существующими суммами `scorers`, поэтому таблица, бомбардиры и достижения не меняются. Для двух команд сервер при старте выбирает `kickoffTeamIndex`. Клиент: новый компонент `TossCoin`, шторка `StartMatchSheet`, переработанные `Teams.tsx`, `MatchGames.tsx`, `GameResultSheet.tsx`.

**Tech Stack:** TypeScript, React 19, Vite, Hono + zod, Cloudflare Workers/D1, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-match-page-games-teams-coin-design.md`

## Global Constraints

- Весь новый текст UI — на русском; «Матч» — событие, «Игра N» — короткая игра.
- Только существующие материалы `material-blue` / `material-graphite`, токены `app.css`; без blur и цветных свечений.
- Кнопки ≥ 48 px, интерактивные строки/чипы ≥ 44 px зоны нажатия.
- Светлая тема — переопределения в `themes.css`; reduced motion отключает анимации.
- Без новых зависимостей и без миграций D1 (состояние игры — JSON в `events.game_state_json`).
- Старые игры без `assists` и старые протоколы без `kickoffTeamIndex` читаются как раньше.

## Review Focus

- Правка старой игры (без `assists`) в новой шторке: сохраняется с пустыми пасами, ничего не теряется.
- Смена автора гола на ассистента того же гола: пас сбрасывается, сервер не получает автор = ассистент.
- Уменьшение счёта: удаляется последний гол вместе с его пасом; сумма пасов автора ≤ его голов.
- Ошибка/409 при броске монеты: монета возвращается, бросок повторяется тем же `requestId`.
- Публикация накануне матча: панель без кнопки «Начать матч», с подсказкой про день игры.

---

### Task 1: Core — типы ассистов, kickoff, статистика

**Files:** Modify `packages/core/src/games.ts`, `packages/core/src/playerStatistics.ts`; Test `packages/core/test/games.test.ts`, `packages/core/test/playerStatistics.test.ts`

**Interfaces — Produces:**
- `interface GameAssist { scorerSignupId: number; assistSignupId: number; goals: number }`
- `GameResult.assists?: GameAssist[]`, `GameResultInput.assists?: GameAssist[]`
- `GameState.kickoffTeamIndex?: number`, `GameProtocolDto.kickoffTeamIndex: number | null`
- `chooseKickoff(rng?: () => number): 0 | 1`
- `PlayerShortGame.assists: number`, `PlayerProtocolSummary.assists: number`, `PlayerProtocolSummary.assistsTracked: boolean` (есть хотя бы одна игра с полем `assists`), `PlayerStatistics.assists: number`, `PlayerStatistics.assistsTracked: boolean`

- [ ] Тест: `summarizePlayerProtocol` считает пасы по `assistSignupId`, `assistsTracked` ложно без поля `assists` у всех игр и истинно при `assists: []`.
- [ ] Тест: `aggregatePlayerStatistics` суммирует `assists`, `assistsTracked` = OR.
- [ ] Реализовать, прогнать `pnpm --filter @altynka/core exec vitest run`, закоммитить.

### Task 2: Worker — kickoff при старте, проверка и хранение пасов

**Files:** Modify `apps/worker/src/domain/gameStart.ts`, `apps/worker/src/domain/games.ts`, `apps/worker/src/api/games.ts`; Test `apps/worker/test/domain/gameStart.test.ts`, `apps/worker/test/domain/games.test.ts`

- [ ] Тест: старт двух команд сохраняет `kickoffTeamIndex ∈ {0,1}` и отдаёт его в протоколе; три команды — `null`.
- [ ] Тест: запись с `assists` сохраняется; отклоняется (`invalid`), если ассистент = автор, из другой команды, автор не в `scorers`, сумма пасов автора > его голов, повтор пары.
- [ ] Тест: повтор того же `requestId` с другими пасами — не дубль (fingerprint включает отсортированные `assists`).
- [ ] Zod: `assists: z.array(z.object({scorerSignupId, assistSignupId, goals}).strict()).max(100).optional()`; запись хранит отсортированный массив (всегда, `[]` если нет).
- [ ] `pnpm --filter @altynka/worker exec vitest run test/domain`, коммит.

### Task 3: Клиент — модель голов с пасами

**Files:** Modify `apps/miniapp/src/lib/gameGoalRuns.ts`, `apps/miniapp/src/lib/gameDraft.ts`; Test `apps/miniapp/test/gameGoalRuns.test.ts`, `apps/miniapp/test/gameDraft.test.ts`

**Produces:** `GoalRun = { signupId: number|null; assist: number|null; goals: number }`; `assistAt(runs, index): number|null`; `setGoalAssist(runs, side, index, assist): GoalRuns`; `setGoalAuthor` сбрасывает пас, если он стал равен автору или автор стал `null`; `inputFromGoalRuns` выдаёт `assists`; `goalRunsFromInput` восстанавливает пасы из `input.assists` (сначала голы с пасами, потом без).

- [ ] Тесты на каждую функцию из Produces + уменьшение счёта убирает пас последнего гола; черновик со старой формой (`goalRuns` без `assist`) читается.
- [ ] Реализовать, `pnpm --filter @altynka/miniapp exec vitest run test/gameGoalRuns.test.ts test/gameDraft.test.ts`, коммит.

### Task 4: Шторка результата — строка паса

**Files:** Modify `apps/miniapp/src/screens/GameResultSheet.tsx`, `apps/miniapp/src/styles/games.css`, `themes.css`; Test `apps/miniapp/test/GameResultSheet.test.tsx`

- [ ] Тест: после выбора автора появляется «Пас: выбрать»; список без автора, с «Без паса»; выбор отправляет `assists` в POST.
- [ ] Легенда «Голы и пасы», подсказка «Пас необязателен — его можно указать позже.», подпись «Автора и пас можно указать позже».
- [ ] Прогнать тест, коммит.

### Task 5: Вкладка «Игры»

**Files:** Modify `apps/miniapp/src/screens/MatchGames.tsx`, `apps/miniapp/src/styles/games.css`, `themes.css`, `apps/miniapp/src/components/skeletons.tsx`; Test `apps/miniapp/test/MatchGames.test.tsx`

- [ ] Тест: нет «6 минут»; очки команд на карточке; авторы в двух колонках с «—»; «Алихан (Дамир)»; чип «С мячом начинают …» в первой игре двух команд.
- [ ] Реализация по разделу 1 спеки; скелетон копирует раскладку.
- [ ] Прогнать тест, коммит.

### Task 6: Монета и шторка старта

**Files:** Create `apps/miniapp/src/components/TossCoin.tsx`, `apps/miniapp/src/screens/StartMatchSheet.tsx`, `apps/miniapp/src/styles/coin.css`; Modify `apps/miniapp/src/lib/tg.ts` (haptic `'heavy'`)

**Produces:** `TossCoin({ faces: {key: TeamColor; name: string}[]; result: number | null; onToss(): void; disabled?: boolean; failed?: boolean })` — `result` индекс в `faces`; `StartMatchSheet({ ev, colors, split, onClose, onStarted, onColorsSaved })`.

- [ ] Тест (в Teams.test): «Начать матч» открывает шторку; клик по монете шлёт start; после ответа виден «Отдыхают …» / «С мячом начинают …» и «К игре 1»; ошибка возвращает возможность броска.
- [ ] Коммит.

### Task 7: «Составы» — редактор и вид игрока

**Files:** Modify `apps/miniapp/src/screens/Teams.tsx`, `apps/miniapp/src/components/TeamColorSheet.tsx`, `apps/miniapp/src/styles/teams.css`, `themes.css`, `skeletons.tsx`; Test `apps/miniapp/test/Teams.test.tsx`, `tests/ui/team-editor.spec.ts`

- [ ] Тесты: «Перемешать» без шторки и с тостом «Отменить»; обмен двумя тапами; «Обмен: Имя» + «Отмена»; «Форма» → шторка одной команды, выбор применяется сразу; панель статусов, включая «Начать матч можно в день игры»; вид игрока — своя команда первой с «Твоя команда», без рейтингов.
- [ ] Коммит.

### Task 8: Профиль — ассисты

**Files:** Modify `apps/miniapp/src/components/PlayerSports.tsx`; Test `apps/miniapp/test/PlayerSports.test.tsx`

- [ ] «Ассисты»: число при `assistsTracked`, иначе «—». Коммит.

### Task 9: Проверка, документация, деплой

- [ ] `pnpm test && pnpm typecheck && pnpm test:ui` — всё зелёное (обновить затронутые Playwright-спеки и фикстуры).
- [ ] DESIGN.md и README — по разделу «Что обновить» спеки.
- [ ] Push в `main`, `pnpm run deploy`, `docs/match-page-games-teams-coin-deployment.md` (коммит, версии Worker, миграций нет, счётчики тестов, проверка).
