# Общий таймер игры и экран игры — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** таймер короткой игры с сигналами на 1:00 / 0:15 / 0:00, который звучит при заблокированном iPhone ведущего, общее время у всех участников и отдельный экран игры `/event/:id/game`.

**Architecture:** сервер хранит только состояние таймера (`events.game_timer_json`: старт, пауза по часам сервера), без ревизии протокола. Каждый телефон считает время сам по серверным часам (сдвиг оценивается из `serverNow`), экран игры опрашивает матч раз в 3 с. Сигналы — WAV-трек, собранный в браузере из коротких клипов и играющий в `<audio>`; у ведущего он стартует сразу по нажатию, без сети.

**Tech Stack:** pnpm monorepo; `@altynka/core` (TS), Cloudflare Worker + Hono + zod + Drizzle/D1; React 19 + Wouter + TanStack Query; vitest (workers pool, happy-dom), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-game-timer-design.md`

## Global Constraints

- Весь пользовательский текст и документы — на русском.
- Длительность игры: 240–600 с, шаг 60, по умолчанию 360. Сигналы: «Последняя минута» за 60 с, «Последняя атака» за 15 с, «Время» на 0.
- Опрос экрана игры — раз в 3 с, только пока экран виден и протокол `playing`.
- Запись таймера не меняет `gameRevision` и не вызывает `sync.request`.
- Отметки таймера на сервере — в пределах ±6 ч от `now`.
- Трек: 16 кГц, моно, 16 бит; клипы в `apps/miniapp/public/sounds/`; голос macOS `Milena`.
- CSP: `media-src 'self' blob:` в `apps/miniapp/public/_headers`.
- Миграция `0022_game_timer.sql`: `ALTER TABLE events ADD COLUMN game_timer_json TEXT`; на remote D1 — до деплоя Worker (`pnpm release` делает это сам).
- Без новых npm-зависимостей. Относительные импорты, без алиасов.
- Ветка `feat/game-timer`; пробник (`git stash` «spike/game-timer») в неё не попадает.

## Review Focus

1. Ведущий жмёт «Старт игры» без сети — трек и цифры идут сразу, состояние уходит на сервер при следующем опросе после возвращения сети (тест в Task 5).
2. Два ведущих: второй ставит паузу на своём телефоне — трек первого останавливается на ближайшем опросе, цифры у всех замирают на одном месте (тест в Task 5).
3. Telegram выгрузил мини-апп посреди игры — после открытия «Продолжить сигналы (осталось M:SS)» перематывает трек на нужное место; если время уже вышло, показывается «Время +M:SS» без ошибки перемотки (тест в Task 5).
4. Результат записан, пока таймер идёт — трек останавливается, Wake Lock отпускается, экран показывает «Ждём старта» для следующей игры; шторка результата не получает 409 (тесты в Task 2 и Task 5).
5. Часы телефона ведущего сбиты на минуты — `startedAt` всё равно в серверном времени, у остальных время совпадает (тест в Task 4).

---

### Task 1: Модель таймера в core

**Files:**
- Create: `packages/core/src/gameTimer.ts`
- Modify: `packages/core/src/index.ts` (добавить `export * from './gameTimer';`), `packages/core/src/games.ts:30-37` (`GameProtocolDto`)
- Test: `packages/core/test/gameTimer.test.ts`

**Interfaces:**
- Produces:
  - `interface GameTimer { gameSequence: number; durationSec: number; startedAt: number; pausedAt: number | null; pausedMs: number; updatedAt: number }`
  - `interface GameTimerReset { gameSequence: number; updatedAt: number; reset: true }`; `type StoredGameTimer = GameTimer | GameTimerReset`
  - константы `GAME_TIMER_MIN_SEC = 240`, `GAME_TIMER_MAX_SEC = 600`, `GAME_TIMER_DEFAULT_SEC = 360`, `LAST_MINUTE_SEC = 60`, `LAST_ATTACK_SEC = 15`
  - `timerElapsedMs(t: GameTimer, serverNow: number): number` — `(pausedAt ?? serverNow) − startedAt − pausedMs`, не меньше 0
  - `timerRemainingSec(t: GameTimer, serverNow: number): number` — `durationSec − elapsed/1000`, может быть отрицательным (добавленное время)
  - `type TimerPhase = 'playing' | 'last_minute' | 'last_attack' | 'over'`; `timerPhase(remainingSec: number): TimerPhase` (границы: `>60` playing, `(15,60]` last_minute, `(0,15]` last_attack, `≤0` over)
  - `type TimerCue = { atSec: number; kind: 'start' | 'last_minute' | 'last_attack' | 'end' }`; `timerCues(durationSec: number): TimerCue[]` → `[0 start, D−60, D−15, D end]`
  - `currentTimer(stored: StoredGameTimer | null, gamesPlayed: number): GameTimer | null` — `null`, если сброс или `gameSequence !== gamesPlayed + 1`
  - `GameProtocolDto.timer?: GameTimer | null`

- [ ] **Step 1: Тесты** `packages/core/test/gameTimer.test.ts`:
  - `timerElapsedMs` с паузой: `{startedAt:1000,pausedAt:61000,pausedMs:5000}` при `serverNow 999999` → `55000`; без паузы `serverNow 31000, pausedMs 1000` → `29000`; `serverNow < startedAt` → `0`.
  - `timerRemainingSec({durationSec:360,...elapsed 370 c})` → `-10`.
  - `timerPhase`: `61→playing, 60→last_minute, 16→last_minute, 15→last_attack, 0.5→last_attack, 0→over, -3→over`.
  - `timerCues(360)` → `[{0,'start'},{300,'last_minute'},{345,'last_attack'},{360,'end'}]`.
  - `currentTimer`: таймер игры 3 при `gamesPlayed 2` → тот же объект; при `gamesPlayed 3` → `null`; `{reset:true}` → `null`; `null` → `null`.
- [ ] **Step 2:** `pnpm --filter @altynka/core exec vitest run test/gameTimer.test.ts` — FAIL (нет модуля).
- [ ] **Step 3:** реализовать `gameTimer.ts`, экспорт в `index.ts`, поле `timer?` в `GameProtocolDto`.
- [ ] **Step 4:** тот же запуск — PASS; `pnpm typecheck` — Done.
- [ ] **Step 5: Commit** (вместе с утверждённой спекой и отчётом прошлого релиза):
```bash
git add packages/core docs/superpowers/specs/2026-11-25-game-timer-design.md docs/profile-help-deployment.md
git commit -m "core: game timer model, phases and cues"
```

### Task 2: Таймер на сервере

**Files:**
- Create: `apps/worker/migrations/0022_game_timer.sql`, `apps/worker/src/domain/gameTimer.ts`
- Modify: `apps/worker/migrations/meta/_journal.json` (запись `idx 22`, `tag "0022_game_timer"`, `when` больше предыдущего), `apps/worker/src/db/schema.ts:60` (`gameTimerJson: text('game_timer_json')`), `apps/worker/src/domain/gameStart.ts` (`gameProtocolFromEvent` → поле `timer`), `apps/worker/src/api/games.ts`
- Test: `apps/worker/test/domain/gameTimer.test.ts`, `apps/worker/test/api/games.test.ts`

**Interfaces:**
- Consumes: `StoredGameTimer`, `GameTimer`, `currentTimer`, константы из Task 1.
- Produces:
  - `setGameTimer(d: Deps, eventId: number, input: StoredGameTimer): Promise<{ kind: 'ok'; timer: GameTimer | null } | { kind: 'not_found' | 'conflict' | 'invalid'; reason?: string }>`
  - `PUT /api/events/:id/games/timer` → `200 { timer }` | `400` | `404` | `409 { error: 'conflict' }`
  - `GameProtocolDto.timer` всегда задан сервером: `active ? currentTimer(parsed, games.length) : null` — и для игроков, и для ведущих.

- [ ] **Step 1: Доменные тесты** `test/domain/gameTimer.test.ts` на `gameFixture()` + `startGameSession` (как в `gameStart.test.ts`):
  - `ok`: таймер игры 1 сохраняется; `getGameProtocol(...).timer` равен ему; `events.gameRevision` не изменился; `(d.sync as FakeSync)` не получил запросов.
  - `conflict`: `gameSequence: 2` при нуле сыгранных; протокол не начат; протокол завершён.
  - `invalid`: `durationSec 200`, `durationSec 390` (не кратно 60), `startedAt` на 7 ч раньше `now`, `pausedMs -1`, `pausedAt < startedAt`.
  - порядок: сохранить `updatedAt 2000`, затем прислать `updatedAt 1000` → ответ `ok` с таймером от `2000`, хранилище не изменилось.
  - сброс `{gameSequence:1,updatedAt:3000,reset:true}` → `timer: null`; более старая запись после сброса игнорируется.
  - после `recordGameResult` по текущей ревизии — `timer` в протоколе `null` (таймер был для игры 1); запись результата не получила `conflict`, хотя таймер писался между чтением ревизии и записью.
- [ ] **Step 2: API-тест** в `test/api/games.test.ts`: игрок → 403; чужое событие `999999` → 404; тело с лишним полем → 400; ведущий → 200 и `GET /api/events/:id/games` у игрока содержит `timer`.
- [ ] **Step 3:** `pnpm --filter @altynka/worker exec vitest run test/domain/gameTimer.test.ts test/api/games.test.ts` — FAIL.
- [ ] **Step 4:** миграция + журнал + схема; `setGameTimer` (чтение события, проверки, сравнение `updatedAt` с сохранённым, `UPDATE events SET game_timer_json = ? WHERE id = ? AND game_timer_json IS <прочитанное>`; при гонке — перечитать и повторить один раз); `timer` в `gameProtocolFromEvent`; маршрут `gamesApi.put('/events/:id/games/timer', requireRole('organizer'), body(timerBody), …)`, `timerBody` — `z.union` двух `.strict()` объектов из полей `GameTimer` и `GameTimerReset`.
- [ ] **Step 5:** тот же запуск — PASS; `pnpm test:migrations` — PASS; `pnpm typecheck` — Done.
- [ ] **Step 6: Commit** `git commit -m "worker: shared game timer state without protocol revisions"`

### Task 3: Звуки и сборка трека

**Files:**
- Create: `scripts/game-timer-sounds.sh`, `apps/miniapp/public/sounds/{beep,minute,attack,whistle,time}.mp3`, `apps/miniapp/public/sounds/keepawake.mp4`, `apps/miniapp/src/lib/timerTrack.ts`
- Modify: `apps/miniapp/public/_headers` (`media-src 'self' blob:`)
- Test: `apps/miniapp/test/timerTrack.test.ts`

**Interfaces:**
- Consumes: `timerCues` из Task 1.
- Produces:
  - `type ClipName = 'beep' | 'minute' | 'attack' | 'whistle' | 'time'`; `TRACK_SAMPLE_RATE = 16000`; `TRACK_TAIL_SEC = 4`
  - `layoutTrack(durationSec: number): { clip: ClipName; atMs: number }[]`
  - `mixTrack(durationSec: number, clips: Record<ClipName, Float32Array>, sampleRate: number): Float32Array`
  - `encodeWav(samples: Float32Array, sampleRate: number): Blob`
  - `buildTrack(durationSec: number): Promise<string>` — object URL, кэш по длительности на сессию

- [ ] **Step 1: Скрипт** `scripts/game-timer-sounds.sh` по образцу пробника (`git stash show -p stash@{0} -- scripts/lab-timer-audio.sh`): `say -v Milena` для «Последняя минута», «Последняя атака», «Время»; сигнал 1760 Гц 0,18 с; свисток 3 кГц с вибрато 1,6 с; каждый клип — отдельный mp3 (моно, `loudnorm=I=-12:TP=-1`); `keepawake.mp4` — 2 с чёрного 16×16 с тишиной. Запустить, закоммитить результат.
- [ ] **Step 2: Тесты** `test/timerTrack.test.ts`:
  - `layoutTrack(360)` → start: `beep@0`; last_minute: `beep@300000, beep@300300, minute@300700`; last_attack: `beep@345000, beep@345250, beep@345500, attack@345900`; end: `whistle@360000, time@361800`.
  - `mixTrack(240, clips из единиц длиной 10 сэмплов, 1000)`: длина `(240+4)*1000`; `out[0] === 1`; `out[180000] === 1`; `out[100] === 0`; наложение двух клипов не выходит за `[-1, 1]`.
  - `encodeWav(new Float32Array([0, 1, -1]), 16000)`: размер `44 + 6`; байты 0–3 `RIFF`, 8–11 `WAVE`; sampleRate в заголовке 16000; сэмплы `0, 32767, -32768`.
- [ ] **Step 3:** `pnpm --filter @altynka/miniapp exec vitest run test/timerTrack.test.ts` — FAIL.
- [ ] **Step 4:** реализовать; `buildTrack` декодирует клипы через `new OfflineAudioContext(1, 1, TRACK_SAMPLE_RATE).decodeAudioData` (ресэмплирует сам), смешивает, кодирует, `URL.createObjectURL`.
- [ ] **Step 5:** PASS; CSP-строка добавлена.
- [ ] **Step 6: Commit** `git commit -m "miniapp: game timer sounds and in-browser track"`

### Task 4: Серверные часы, Wake Lock, локальное хранилище таймера

**Files:**
- Create: `apps/miniapp/src/lib/serverClock.ts`, `apps/miniapp/src/lib/keepAwake.ts`, `apps/miniapp/src/lib/gameTimerStore.ts`
- Test: `apps/miniapp/test/serverClock.test.ts`, `apps/miniapp/test/gameTimerStore.test.ts`

**Interfaces:**
- Consumes: `StoredGameTimer`, `GAME_TIMER_*` из Task 1; `resourceReceivedAt` из `lib/queryClient.ts`.
- Produces:
  - `noteServerTime(serverNow: number, receivedPerf: number): void` — оценка `serverNow − receivedPerf`, хранится **максимум** по выборкам (у максимума наименьшая задержка ответа)
  - `serverNow(): number` (`performance.now() + оценка`; без выборок — `Date.now()`), `toServerTime(perf: number): number`, `resetServerClock(): void` (для тестов)
  - `keepAwake(): { release(): void }` — `navigator.wakeLock.request('screen')`, перезапрос на `visibilitychange → visible`; без `wakeLock` — зацикленное беззвучное `/sounds/keepawake.mp4`
  - `readPendingTimer(eventId): StoredGameTimer | null`, `writePendingTimer(eventId, t)`, `clearPendingTimer(eventId)`, `readTimerDuration(): number` (по умолчанию 360, мусор → 360), `writeTimerDuration(sec)`; ключи `altynka:game-timer:<eventId>` и `altynka:game-timer-duration`; все обращения в try/catch

- [ ] **Step 1: Тесты:**
  - `serverClock`: выборки `(10_000, 100)` и `(10_050, 200)` → оценка `9_900` (максимум из `9_900` и `9_850`); при подменённом `Date.now` на +10 мин `serverNow()` не меняется; `toServerTime(500) === 10_400`.
  - `gameTimerStore`: запись/чтение/очистка; `readTimerDuration` при `'abc'` и при `'900'` → 360; бросающий `localStorage` → `null`/360 без исключения.
- [ ] **Step 2:** запуск обоих файлов — FAIL.
- [ ] **Step 3:** реализовать три модуля.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `git commit -m "miniapp: server clock, keep-awake and timer storage"`

### Task 5: Хук `useGameTimer`

**Files:**
- Create: `apps/miniapp/src/hooks/useGameTimer.ts`
- Test: `apps/miniapp/test/useGameTimer.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`timerRemainingSec`, `timerPhase`, `GameTimer`), Task 3 (`buildTrack`), Task 4 (всё), `api.send`.
- Produces: `useGameTimer(ev: EventDetailDto): GameTimerView`, где
  ```ts
  interface GameTimerView {
    status: 'waiting' | 'running' | 'paused';
    remainingSec: number; phase: TimerPhase;
    durationSec: number; setDurationSec(sec: number): void; // только в waiting
    sound: 'off' | 'on' | 'resumable';                       // resumable — состояние есть, звука нет после перезапуска
    canControl: boolean;                                      // ev.gameProtocol.canRecord
    start(): Promise<void>; pause(): void; resume(): Promise<void>; reset(): void;
    listen(): Promise<void>; mute(): void;
  }
  ```
  Правила:
  - Каждое новое `ev` → `noteServerTime(ev.serverNow, resourceReceivedAt(ev))`.
  - Действующее состояние = более свежее по `updatedAt` из `ev.gameProtocol.timer` и `readPendingTimer` (если pending относится к текущей игре).
  - `start/pause/resume/reset` (жест): сначала локально (трек, `keepAwake`), затем `writePendingTimer` и `PUT …/games/timer` с отметками `toServerTime(performance.now())`; успех → `clearPendingTimer`; ошибка → pending остаётся и повторно отправляется при каждом новом `ev`.
  - Свой трек играет с `currentTime = elapsed`; цифры: при играющем треке — из `audio.currentTime`, иначе `timerRemainingSec(timer, serverNow())`; тик раз в 250 мс.
  - Новое `ev` с другим состоянием (пауза/продолжение/сброс от другого ведущего) или с другой текущей игрой → трек останавливается/перематывается (расхождение > 1 с), `keepAwake` отпускается, когда звука нет.
  - Media Session: заголовок `Игра N · таймер`, `play`/`pause` → `resume()`/`pause()`.
  - `haptic` из `lib/tg` в моменты смены фазы, пока экран виден.

- [ ] **Step 1: Тесты** (`vi.mock` для `../src/lib/api`, `../src/lib/timerTrack`, `../src/lib/keepAwake`, `../src/lib/tg`; фейковый `HTMLAudioElement` через `vi.spyOn(window, 'Audio')`; `vi.useFakeTimers`):
  - старт: трек играет с 0, `api.send` вызван с `PUT` и `startedAt === toServerTime(performance.now())`; `status 'running'`.
  - **без сети:** `api.send` отклоняется → трек всё равно играет, `readPendingTimer` содержит состояние; новое `ev` без таймера → повторный `PUT` с тем же `updatedAt`; после успеха pending очищен.
  - **второй ведущий поставил паузу:** новое `ev` с `pausedAt` и `updatedAt` новее → `audio.pause()` вызван, `status 'paused'`, `remainingSec` больше не меняется.
  - **перезапуск:** `ev.gameProtocol.timer` идёт 100 с, звука нет → `sound 'resumable'`; `listen()` → `currentTime === 100`; таймер 400 с при длительности 360 → `remainingSec ≈ -40`, `phase 'over'`, `listen()` не перематывает за конец трека.
  - **результат записан:** новое `ev`, где `games.length` вырос, а `timer` пришёл `null` → трек остановлен, `keepAwake().release` вызван, `status 'waiting'`.
  - участник без `canRecord`: `canControl false`; `listen()` играет трек с текущего места, `PUT` не отправляется.
  - `setDurationSec` в `running` не меняет `durationSec`; в `waiting` — меняет и пишет `writeTimerDuration`.
- [ ] **Step 2:** `pnpm --filter @altynka/miniapp exec vitest run test/useGameTimer.test.tsx` — FAIL.
- [ ] **Step 3:** реализовать хук.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `git commit -m "miniapp: shared game timer hook"`

### Task 6: Экран игры

**Files:**
- Create: `apps/miniapp/src/screens/GameScreen.tsx`, `apps/miniapp/src/components/GameTimer.tsx`, `apps/miniapp/src/styles/game-screen.css`
- Modify: `apps/miniapp/src/App.tsx` (lazy-маршрут `/event/:id/game` до `/event/:id`), `apps/miniapp/src/styles/app.css` (`@import './game-screen.css';`), `apps/miniapp/test/gameFixtures.ts` (`timer: null` в `makeProtocol`)
- Test: `apps/miniapp/test/GameScreen.test.tsx`

**Interfaces:**
- Consumes: `useGameTimer` (Task 5), `useResource('/api/events/:id')`, `GameResultSheet`, `ActionSheet`, `ConfirmButton`, `MatchAction`, `Screen`, `teamAppearance`.
- Produces: маршрут `/event/:id/game`; `GameTimer({ view }: { view: GameTimerView })`.

Тексты (точно): заголовок `Игра N`; фазы `Ждём старта` / `Игра идёт` / `Последняя минута` / `Последняя атака` / `Время +M:SS` / `Пауза`; кнопки `Старт игры`, `Пауза`, `Продолжить`, `Слышать сигналы`, `Выключить сигналы`, `Продолжить сигналы (осталось M:SS)`, `Внести результат`; в «⋯» (`aria-label="Действия"`, шторка `Протокол матча`): `Сбросить таймер` (подтверждение `Сбросить таймер игры N?`), `Отменить последнюю запись`, `Завершить матч` — последние два переиспользуют логику `MatchGames` (вынести `undo`/`finish` в общий модуль `screens/gameProtocolActions.ts`, если без этого пришлось бы копировать); подсказка один раз (флаг в `localStorage`): `Экран не погаснет сам. Можно заблокировать телефон — сигналы прозвучат.`; длительность — степпер `− 6 мин +` с `aria-label="Длительность игры"`.

- [ ] **Step 1: Тесты** `test/GameScreen.test.tsx` (`useGameTimer` замокан, `api.get` отдаёт событие):
  - ведущий: видит пару, «Отдыхают …», `Старт игры`, степпер, `Внести результат` → открывается диалог шторки результата; «⋯» содержит три действия.
  - участник: видит цифры и `Слышать сигналы`, нет `Старт игры`, `Внести результат`, «⋯».
  - протокол не `playing` → переход на `/event/7?tab=games`.
  - опрос: `api.get` вызван снова через 3000 мс (`vi.advanceTimersByTime`), при `document.visibilityState === 'hidden'` — не вызван.
- [ ] **Step 2:** `pnpm --filter @altynka/miniapp exec vitest run test/GameScreen.test.tsx` — FAIL.
- [ ] **Step 3:** реализовать экран, компонент таймера и стили по DESIGN.md (материалы карточек, крупные табличные цифры, contextual action над доком, reduced motion — без анимации смены фазы).
- [ ] **Step 4:** PASS; `pnpm typecheck` — Done.
- [ ] **Step 5: Commit** `git commit -m "miniapp: game screen with shared timer"`
- [ ] **Step 6: Проверка на iPhone (стоп-точка):** `pnpm release --staging`; в тестовой группе начать матч, открыть `/event/<id>/game`, длительность 4 мин, `Старт игры`, заблокировать телефон. Ожидание: сигналы на 3:00, 3:45, 4:00. Если собранный WAV в фоне не играет — заменить `buildTrack` на готовые mp3 по длительностям (скрипт пробника из stash), остальное не трогать; повторить проверку. Второй телефон (участник) видит то же время, паузу — в пределах 3 с.

### Task 7: Переходы на экран игры

**Files:**
- Modify: `apps/miniapp/src/screens/MatchGames.tsx` (карточка текущей игры — ссылка `Открыть игру` на `/event/:id/game` для всех; у ведущего `MatchAction` — `Открыть игру` вместо `Внести результат`; «Изменить» прошлых игр остаётся во вкладке), `apps/miniapp/src/screens/StartMatchSheet.tsx:68` (`navigate('/event/${ev.id}/game')`)
- Test: `apps/miniapp/test/MatchGames.test.tsx`, `apps/miniapp/test/Teams.test.tsx` (старт ведёт на экран игры), `tests/ui/game-statistics.spec.ts` + `tests/ui/game-statistics-fixture.ts`

- [ ] **Step 1:** обновить юнит-тесты: во вкладке у ведущего есть ссылка `Открыть игру` с `href="/event/7/game"` и нет кнопки `Внести результат`; после броска монеты путь — `/event/7/game`.
- [ ] **Step 2:** запуск `test/MatchGames.test.tsx test/Teams.test.tsx` — FAIL.
- [ ] **Step 3:** изменения в `MatchGames` и `StartMatchSheet`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** фикстура Playwright: `GET /api/events/7` отдаёт `gameProtocol.timer`, обработчик `PUT /api/events/7/games/timer` сохраняет тело; в `game-statistics.spec.ts` сценарии записи результата идут через `/event/7/game` (`Внести результат` там). `pnpm build && pnpm exec playwright test tests/ui/game-statistics.spec.ts` — PASS.
- [ ] **Step 6: Commit** `git commit -m "miniapp: match page leads to the game screen"`

### Task 8: Playwright экрана игры

**Files:**
- Create: `tests/ui/game-screen.spec.ts`
- Modify: `tests/ui/horizontal-scroll.spec.ts` (в `longWorld` событию 2 — `protocolVersion: 1` и `gameProtocol` в состоянии `playing` с длинными именами; визиты `/event/2/game` для игрока и ведущего, шторка `Протокол матча` у ведущего), `playwright.config.ts` (спеку — в mobile-WebKit проект, как `game-statistics`)

- [ ] **Step 1: Спека** на `gameStatisticsWorld({started:true})`, `page.addInitScript` подменяет `HTMLMediaElement.prototype.play` на `Promise.resolve()` и `navigator.wakeLock`:
  - ведущий: `Старт игры` → `PUT …/games/timer` с `durationSec 360`; фаза `Игра идёт`; `Пауза` → фаза `Пауза`, цифры не меняются 2 с.
  - `page.clock` вперёд до 0:59 → `Последняя минута`; до 0:14 → `Последняя атака`; за ноль → `Время +0:0x`.
  - `Внести результат` → сохранить → `Игра 2`, `Ждём старта`.
  - участник (роль `player`): цифры идут по таймеру фикстуры, кнопок управления нет.
  - axe без нарушений (как в соседних спеках).
- [ ] **Step 2:** `pnpm build && pnpm exec playwright test tests/ui/game-screen.spec.ts tests/ui/horizontal-scroll.spec.ts` — PASS (Chromium и WebKit).
- [ ] **Step 3: Commit** `git commit -m "test: game screen browser coverage"`

### Task 9: Документы и итоговая проверка

**Files:**
- Modify: `README.md` («Игровая статистика»: убрать «Шесть минут — ориентир: живого таймера и автоматической записи результата нет», описать таймер, сигналы, общее время, экран игры, порядок релиза с `0022`), `DESIGN.md` (раздел «Экран игры и таймер»: состав экрана, фазы, contextual action, Wake Lock, reduced motion)

- [ ] **Step 1:** правки README и DESIGN.md.
- [ ] **Step 2:** `pnpm test && pnpm typecheck && pnpm test:migrations && pnpm test:ui` — всё зелёное.
- [ ] **Step 3:** `pnpm release --staging`; повторить ручную проверку Task 6 Step 6 плюс беззвучный режим iPhone; при наличии — Android. Записать результаты в описание PR.
- [ ] **Step 4: Commit** `git commit -m "docs: game timer and game screen"`; дальше — PR (по запросу пользователя), прод-релиз — только по его команде.
