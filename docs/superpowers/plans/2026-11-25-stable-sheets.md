# Шторки без прыжков — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Открытая нижняя шторка не меняет высоту от действий внутри неё и от загрузки; будущее содержимое заранее занимает своё место (заглушка с подсказкой, наложение панелей, каркас той же высоты).

**Architecture:** Страховка в `components/ActionSheet.tsx`: шторка запоминает наибольшую естественную высоту и держит её минимумом через CSS-переменную `--sheet-min`, ограниченную максимумом шторки; смена шага (`step`) сбрасывает минимум. Общие средства резерва: компонент `SheetPlaceholder` и класс `.sheet-stack`. Затем аудит всех шторок и применение приёмов по аудиту, с проверками Playwright «высота не изменилась».

**Tech Stack:** React 19, TypeScript, CSS, vitest + Testing Library (happy-dom), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-stable-sheets-design.md`

## Global Constraints

- Весь пользовательский текст и документация — на русском (DESIGN.md — по-английски, как весь файл).
- Шторка не уменьшается, пока открыта; минимум = `min(var(--sheet-min), <та же формула, что у max-height в .create-sheet>)`; замер — естественная высота, не записывается, пока шторка упёрлась в максимум.
- Смена `step` у `ActionSheet` сбрасывает запомненную высоту; закрытие — тоже. Вложенные шторки — свои экземпляры.
- Заглушка: та же форма и размер, что у будущего содержимого (размер берётся из реального содержимого, не на глаз); пунктирная рамка 1px `--line`; без заливки и без акцента; подсказка по центру, `--hint`, 14 px, обычный читаемый текст; не нажимается, не получает фокус.
- Подсказки: коротко, «что сделать → что появится», 1–2 строки на 320 px.
- Наложение панелей: все панели в одной ячейке сетки, неактивные `visibility: hidden` + `inert` (скрыты от диктора и фокуса); высота по самой длинной.
- Появление содержимого на месте заглушки — затухание на месте 220 мс без движения; `prefers-reduced-motion` — сразу.
- Каркас загрузки в шторке — той же высоты, что и загруженное; при данных переменной длины — типичное число строк.
- `MenuSheet` не трогать. Подъём над клавиатурой не менять. Внешний вид шторок не переделывать.
- На 320 px — без горизонтального скролла (фикстура Playwright).

## Review Focus

1. Клавиатура открылась в шторке с формой (например «Сообщить о проблеме») и закрылась — шторка вернулась к своей высоте, не выше экрана и не сжатая (тест в Task 1).
2. Шторка, открытая на маленьком экране (высота 600 px) с содержимым выше экрана — скролл внутри как раньше, минимум не выталкивает её за экран (тест в Task 1).
3. Шторка переходит на другой шаг (VenuePicker «Новая площадка», DeleteMyData «Данные удалены») — новая высота по новому шагу, без лишней пустоты (тесты в Task 1 и Task 4).
4. Закрыть шторку перетаскиванием и открыть снова — высота с нуля, анимация закрытия не ломается от `min-height` (тест в Task 1).
5. Заглушка и реальное содержимое расходятся по высоте на другой ширине (320 vs 390 px) — проверка высоты Playwright на обеих ширинах для «Когда могу играть» (Task 3).

---

### Task 1: Страховка в ActionSheet и общие средства резерва

**Files:**
- Modify: `apps/miniapp/src/components/ActionSheet.tsx`, `apps/miniapp/src/styles/app.css` (правило `.create-sheet` — добавить `min-height` с `min()`; стили `.sheet-placeholder`, `.sheet-stack`)
- Create: `apps/miniapp/src/components/SheetPlaceholder.tsx`, `tests/ui/sheet-height.ts` (помощник Playwright)
- Modify: `DESIGN.md` (абзац о нижних шторках, «Creation opens a native bottom sheet…»)
- Test: `apps/miniapp/test/ActionSheet.test.tsx` (новый), `tests/ui/sheet-interactions.spec.ts` (дополнить)

**Interfaces:**
- Produces:
  - `ActionSheet` получает необязательный prop `step?: string | number` — смена значения сбрасывает запомненную высоту. Остальное API без изменений.
  - `SheetPlaceholder({ hint, children, className }: { hint: string; children: ReactNode; className?: string })` — рендерит `children` невидимо (`visibility: hidden`, `inert`, `aria-hidden`) в той же ячейке, что и подсказку, поэтому размер ровно как у реального содержимого; поверх — рамка и `hint`. Использование: `{ready ? <Times/> : <SheetPlaceholder hint="…"><Times/></SheetPlaceholder>}`.
  - CSS `.sheet-stack` (контейнер `display: grid`), дети `.sheet-stack > *` в `grid-area: 1 / 1`; неактивная панель получает атрибут `inert` и класс `.sheet-stack-hidden` (`visibility: hidden`).
  - `tests/ui/sheet-height.ts`: `expectStableSheet(page: Page, sheet: Locator, action: () => Promise<void>): Promise<void>` — меряет `boundingBox().height` шторки до и после действия (после окончания анимаций), допуск 1 px.

- [ ] **Step 1: Write failing unit tests** (`ActionSheet.test.tsx`; в happy-dom размеры подменить: замокать `ResizeObserver` и `getBoundingClientRect`/`scrollHeight` контента, как удобно):
  - «height never shrinks while open» — содержимое 500 → 300 px ⇒ `--sheet-min` на диалоге = `500px`.
  - «grows with content» — 300 → 500 ⇒ `--sheet-min` = `500px`.
  - «measurements at the max height are ignored» — шторка упёрлась в максимум (естественная высота ≥ максимума, например клавиатура уменьшила `--sheet-viewport`) ⇒ запомненное значение не падает до сжатого.
  - «step change resets» — `step` 'list' → 'add', содержимое стало 200 ⇒ `--sheet-min` = `200px`.
  - «reopen starts fresh» — размонтировать и смонтировать заново ⇒ нет унаследованного `--sheet-min`.
  - `SheetPlaceholder`: подсказка видна и доступна как текст; дети в DOM с `aria-hidden="true"` и `inert`; кнопки детей не в табуляции.
- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @altynka/miniapp exec vitest run test/ActionSheet.test.tsx`.
- [ ] **Step 3: Implement** страховку (замер естественной высоты содержимого шторки — заголовок + контент + футер; `--sheet-min` на `dialog`), `step`, `SheetPlaceholder`, `.sheet-stack`, CSS `min-height: min(var(--sheet-min, 0px), <формула max-height>)`. Анимация закрытия (`useBottomSheet`, `offsetHeight + 32`) и перетаскивание не должны сломаться.
- [ ] **Step 4: Playwright** — в `sheet-interactions.spec.ts` добавить: (а) шторка с формой, фокус в поле на мобильном WebKit-проекте/эмуляции уменьшения `--sheet-viewport` и обратно ⇒ высота вернулась к исходной ±1 px; (б) окно 390×600 и шторка с длинным списком ⇒ шторка не выше окна, контент прокручивается; (в) закрытие перетаскиванием и повторное открытие работают. Помощник `expectStableSheet` в `tests/ui/sheet-height.ts`.
- [ ] **Step 5: DESIGN.md** — правило высоты шторок и вид заглушки (по Global Constraints).
- [ ] **Step 6: Run, expect PASS** — весь miniapp vitest, `pnpm typecheck`, `pnpm build`, `pnpm exec playwright test tests/ui/sheet-interactions.spec.ts tests/ui/horizontal-scroll.spec.ts tests/ui/skeletons.spec.ts`.
- [ ] **Step 7: Commit** — `git commit -m "miniapp: sheets never shrink while open; placeholder and stacked panels"`

---

### Task 2: Аудит всех шторок

**Files:**
- Create: `docs/superpowers/plans/2026-11-25-stable-sheets-audit.md`

**Interfaces:**
- Consumes: приёмы из Task 1 (`SheetPlaceholder`, `.sheet-stack`, каркас, `step`).
- Produces: таблица, по которой работают Tasks 3–5.

- [ ] **Step 1: Inventory** — все прямые использования `ActionSheet` в `apps/miniapp/src` (`git grep -n "<ActionSheet"`; ожидается ~35 в ~28 файлах, включая условные ветки `if (...) return <ActionSheet …>`).
- [ ] **Step 2: For each sheet** — строка таблицы: файл:строка, заголовок шторки, состояния, при которых меняется высота (появление по действию, вкладки/фильтры, загрузка, ошибка поля, смена шага), приём (заглушка / наложение / каркас / `step` / «ничего не нужно»), точный текст подсказки для каждой заглушки (правила Global Constraints), как проверить в Playwright (какой мок/фикстура нужны, есть ли уже).
- [ ] **Step 3: Group** — распределить строки по Task 4 (матч, игры, состав, счёт, площадки, назначение игры) и Task 5 (профиль, достижения, лента, помощь, создание матча, промпты). «Когда могу играть» — Task 3.
- [ ] **Step 4: Commit** — `git commit -m "docs: stable sheets audit"`

Ошибки полей формы (`field-error`), которые появляются под полем: резервировать строку только там, где ошибка ожидаема в обычном сценарии (проверка номера Kaspi, занятое имя); остальные отметить «страховка».

---

### Task 3: «Когда могу играть»

**Files:**
- Modify: `apps/miniapp/src/screens/Availability.tsx` (`MarkEditor`), стили availability (`apps/miniapp/src/styles/availability.css`)
- Test: `apps/miniapp/test/Availability.test.tsx`, `tests/ui/availability.spec.ts`

**Interfaces:**
- Consumes: `SheetPlaceholder` (Task 1), `expectStableSheet` (Task 1).

Поведение: пока статус не «Могу», на месте блока «Во сколько можешь» + ряд кнопок времени + строка статуса стоит `SheetPlaceholder` с подсказкой **«Выбери «Могу» — здесь появится выбор времени»**. Каркас загрузки шторки — той же высоты, что загруженный календарь с редактором (включая место заглушки).

- [ ] **Step 1: Failing tests** — unit: «до «Могу» показана подсказка, кнопок времени нет в табуляции»; «после «Могу» подсказки нет, кнопки времени доступны». Playwright: `expectStableSheet` при нажатии «Могу», «Не могу», «Не указано» и при смене дня — на 390 и 320 px; высота каркаса загрузки = высоте загруженной шторки (±1 px).
- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @altynka/miniapp exec vitest run test/Availability.test.tsx`; `pnpm build && pnpm exec playwright test tests/ui/availability.spec.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS** (те же команды + весь miniapp vitest, `pnpm typecheck`).
- [ ] **Step 5: Commit** — `git commit -m "miniapp: availability sheet keeps its height"`

---

### Task 4: Шторки матча, игр, состава, счёта и площадок

**Files:** строки аудита, отнесённые к Task 4 (ожидаемо: `screens/GameResultSheet.tsx`, `screens/MatchGames.tsx`, `screens/StartMatchSheet.tsx`, `screens/Schedule.tsx`, `components/VenuePicker.tsx`, `screens/Venues.tsx`, `screens/Teams.tsx`, `components/TeamColorSheet.tsx`, `screens/Event.tsx`, `screens/MatchParticipation.tsx`, `screens/MatchRatings.tsx`, `screens/ReviewRater.tsx`, `screens/Bill.tsx`, `screens/AddGuest.tsx`, `screens/EventList.tsx`) и их стили; тесты — соответствующие `apps/miniapp/test/*.test.tsx` и `tests/ui/*.spec.ts` (+ фикстуры при необходимости).

**Interfaces:**
- Consumes: всё из Task 1, таблица Task 2.

- [ ] **Step 1: Failing tests** — для каждой строки аудита со сменой состояния: Playwright `expectStableSheet` вокруг действия; unit-тест, что заглушка с текстом из аудита видна до действия и исчезает после.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** по аудиту; шторки со сменой шага получают `step` (VenuePicker «Место проведения» / «Новая площадка»).
- [ ] **Step 4: Run, expect PASS** — затронутые unit и Playwright-спеки, весь miniapp vitest, `pnpm typecheck`, `pnpm test:ui`.
- [ ] **Step 5: Commit** — `git commit -m "miniapp: match and game sheets keep their height"`

---

### Task 5: Шторки профиля, ленты, помощи, создания матча и промптов

**Files:** строки аудита, отнесённые к Task 5 (ожидаемо: `screens/ProfileSettings.tsx`, `screens/PlayerProfile.tsx`, `components/PlayerAchievements.tsx`, `components/PlayerGameHistory.tsx`, `components/PlayerSports.tsx`, `components/ReportProblem.tsx`, `components/DeleteMyData.tsx`, `components/SkillsPrompt.tsx`, `components/AvailabilityPrompt.tsx`, `components/NewsFeed.tsx`, `screens/NewEvent.tsx`) и их стили; тесты как в Task 4.

**Interfaces:** как в Task 4. `DeleteMyData` — `step` при переходе к «Данные удалены».

- [ ] **Step 1–5** — как в Task 4; коммит `git commit -m "miniapp: profile and other sheets keep their height"`.
- [ ] **Step 6: Полная проверка** — `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:ui` — всё зелёное; DESIGN.md сверен с итогом (если по ходу появились уточнения правила).

---

## После плана

- Шторка выбора клуба (`feat/club-themes`): после слияния веток вкладки «Клубы | Сборные» перевести на `.sheet-stack` и добавить `expectStableSheet` в `tests/ui/club-theme.spec.ts`.
- Staging — по команде пользователя (сейчас там `feat/club-themes`).
