# Game Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить ручной старт встречи с неизменными составами, последовательную запись коротких игр, ротацию команд, таблицу и бомбардиров.

**Architecture:** Новые встречи используют версию протокола 1; существующие остаются на версии 0 с прежними правилами. Протокол одной встречи хранится одним JSON-агрегатом в D1 и изменяется условным UPDATE по ревизии, чтобы результат и следующая пара сохранялись атомарно. Спортивные этапы независимы от состояния денежного расчёта, а правила ротации и статистики находятся в core.

**Tech Stack:** Существующие TypeScript, React 19, Vite, Hono, Drizzle/D1, grammY, Durable Objects, Vitest и Playwright; без новых зависимостей.

**Spec:** [2026-11-06-game-statistics-design.md](../specs/2026-11-06-game-statistics-design.md), утверждён пользователем.

## Global Constraints

- «Результат и забивших записывает организатор после каждой короткой игры».
- «Команда, сыгравшая две игры подряд, садится независимо от результата второй игры».
- «Составы фиксируются по явной кнопке организатора „Начать встречу“, а не по назначенному времени».
- «За победу 3 очка, за ничью 1, за поражение 0».
- «Отдельный живой таймер не входит в первую версию».
- «Голы и победы не меняют существующий рейтинг по оценкам участников».
- Старые встречи, включая назначенные до обновления, сохраняют прежний lifecycle.
- Снимок содержит signupId, userId либо null, имя на старте и индекс цветной команды.
- Ввод статистики и чтение ограничены группой встречи; гости не требуют аккаунта.
- Первая версия локальная, без деплоя, сезонных итогов и новых отчётов о результатах в Telegram.
- Сохранить существующие темы, мобильные размеры, оплату, роли и анонимность оценок.

## Review Focus

1. Старт одновременно с удалением гостя/обменом игроков: сохраняется целиком один актуальный состав либо старт отклоняется; проверка в Task 3.
2. Ответ потерян после успешной записи: повтор старого запроса после следующей игры возвращает прежний результат, а не создаёт ещё игру; проверка в Task 4.
3. Исправление первой игры после уже записанной второй: счёт исправляется, фактические пары сохраняются и дальнейшая ротация не ломается; проверка в Task 4.
4. Оплата закрыта до последней игры: встреча остаётся активной, доступной для протокола и завершения; проверки в Tasks 5 и 8.
5. Начали встречу, но никто не играл: завершение с пустым списком не создаёт опрос и не оставляет встречу незавершённой; проверка в Task 5.

---

## Карта файлов и зависимостей

| Область | Файлы и ответственность |
|---|---|
| Правила и контракт | Создать `packages/core/src/games.ts`; расширить `api.ts`, `lifecycle.ts`, `index.ts`. |
| Хранение | Расширить `apps/worker/src/db/schema.ts`; создать миграцию `0011_game_statistics.sql`, модуль `domain/gameStore.ts`, тест миграции. |
| Старт/фиксация | Создать `apps/worker/src/domain/gameStart.ts`; изменить `domain/events.ts`, `domain/teams.ts`, создать `api/games.ts`. |
| Команды протокола | Создать `apps/worker/src/domain/games.ts`; расширить `api/games.ts` и `api/routes.ts`. |
| Lifecycle/расчёт/бот | Изменить `domain/bills.ts`, `domain/ratings.ts`, `domain/eventView.ts`, `api/ratings.ts`, `sync/{parts,EventSync,automatic}.ts`, `render/eventMessage.ts`, `bot/private.ts`. |
| Подготовка UI | Изменить `screens/{Event,Teams,Matches,MatchParticipation,MatchRatings,Bill}.tsx`, `hooks/useMatchPhase.ts`, `components/MatchCard.tsx`, `lib/labels.ts`. |
| Статистика UI | Создать `screens/{MatchGames,GameResultSheet}.tsx`, `lib/gameDraft.ts`, `styles/games.css`; подключить в `screens/Event.tsx`, `styles/app.css`. |
| Проверка | Новые core/worker/miniapp-тесты возле соответствующих модулей; `tests/ui/game-statistics.spec.ts` и фикстура; расширить существующие lifecycle/оплата/бот проверки. |

Зависимости: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Tasks 6–7 → Task 8.
Во время реализации использовать изоляцию по using-git-worktrees. Не переключать и
не очищать пользовательские изменения. Номера миграции/метаданных проверить ещё
раз при старте работы: последний номер на момент плана — 0010.

## Контракт данных

Индексы команд соответствуют `TEAMS`: 0 красные, 1 синие, 2 жёлтые. Ориентация
пары стабильна и определяет стороны результата, а не положение в таблице.

```ts
type GamePair = readonly [number, number];
type GameScore = readonly [number, number];
interface GameRosterPlayer { signupId: number; userId: number | null; name: string; teamIndex: number }
interface GameGoals { signupId: number; goals: number }
interface GameResult {
  id: string; sequence: number; pair: GamePair; score: GameScore;
  scorers: GameGoals[]; firstRestTeamIndex: number | null;
  recordedAt: number; recordedBy: number; updatedAt: number; updatedBy: number;
}
interface GameState {
  teamCount: 2 | 3; roster: GameRosterPlayer[];
  initialPair: GamePair; currentPair: GamePair; games: GameResult[];
  receipts: GameCommandReceipt[];
}
interface GameMutationMeta { requestId: string; expectedRevision: number }
interface GameResultInput { score: GameScore; scorers: GameGoals[]; firstRestTeamIndex?: number }
```

`GameCommandReceipt` — внутренний журнал `{requestId, fingerprint, revision}`:
fingerprint включает действие, ID игры и нормализованный payload. При повторе
сначала искать receipt, затем проверять expectedRevision. Совпадение возвращает
успех с `appliedRevision` и актуальным DTO; другой payload с тем же requestId —
409. Журнал не отдавать обычному клиенту. ID игр не переиспользовать после отмены.

`GameProtocolDto`: `{state: 'legacy'|'not_started'|'playing'|'completed', revision,
startedAt, completedAt, teamCount, roster, currentPair, restingTeamIndex, games,
standings, scorers, canStart, canRecord, canEdit, canUndo, canFinish}`. Nullable
поля до старта — null, списки пусты; legacy показывает отсутствие протокола.
`currentPair` после завершения — null, незаписанная пара не попадает в историю.
DTO разрешений вычисляется сервером для текущего пользователя.

## Task 1: Чистые правила ротации, статистики и lifecycle

**Files:** Create `packages/core/src/games.ts`, `packages/core/test/games.test.ts`; modify `packages/core/src/{api,lifecycle,index}.ts`, `packages/core/test/lifecycle.test.ts`.

**Interfaces:**
- Consumes: существующие `TeamCount`, `TEAMS`, `EventStatus` и `matchStartsAt`.
- Produces: типы выше; `chooseFirstPair(count: TeamCount, rng?: () => number): GamePair`, `resolveFirstRest(pair: GamePair, score: GameScore, chosen?: number): number`, `nextGamePair(count: TeamCount, games: readonly GameResult[]): GamePair`, `calculateStandings(count: TeamCount, games: readonly GameResult[]): TeamStanding[]`, `calculateScorers(roster: readonly GameRosterPlayer[], games: readonly GameResult[]): ScorerTotal[]`.
- `TeamStanding`: teamIndex, rank, played, wins, draws, losses, goalsFor, goalsAgainst, goalDifference, points. `ScorerTotal`: signupId, userId, name, teamIndex, goals; равенство голов означает общее место, стабильный порядок имён/signupId.
- `EventSummaryDto`: добавить optional `protocolVersion?: 0|1`, `startedAt?: number|null`, `completedAt?: number|null`; отсутствие версии означает 0 для старых фикстур. `EventDetailDto` получает `gameProtocol?: GameProtocolDto`.

- [ ] **Step 1: Написать тесты правил и подсчёта.** Для первой пары проверить rng 0, 0.4, 0.9 → все три допустимые пары. Проверить победу каждой стороны, обязательный выбор при первой ничьей, ошибку при выборе третьей команды. Для A–B с победой A проверить следующие пары `[0,2]`, `[1,2]`, `[0,1]` независимо от побед/ничьих последующих игр. Для двух команд следующая пара всегда `[0,1]`. Таблица для A–B 2:1 и A–C 0:0: у A 4 очка, 2 игры, 2:1 мячи; у B 0 очков; у C 1 очко. Добавить полный tie, нулевые игры, два гола гостя и отсутствие автора.
- [ ] **Step 2: Проверить, что тесты падают.** Run `pnpm --filter @altynka/core test -- test/games.test.ts`; ожидается отсутствие новых экспортов.
- [ ] **Step 3: Реализовать экспортированные типы и функции.** `resolveFirstRest` возвращает проигравшего либо выбранную игравшую команду при ничьей. `nextGamePair` использует сохранённый выбор отдыха после первой игры; дальше пересечение последних двух пар определяет команду с двумя играми. Таблица сортируется по очкам, разнице, забитым; полное равенство разделяет место. Неизвестные авторы не становятся бомбардирами.
- [ ] **Step 4: Добавить и запустить lifecycle-тесты до изменения функции.** Версия 1 после назначенного времени остаётся scheduled до ручного старта; started без completed даёт playing даже при raw status billing/closed; completed даёт billing при raw billing, иначе closed. Cancelled имеет приоритет. Версия 0 сохраняет переход по часам и действующие проверки часового пояса.
- [ ] **Step 5: Расширить `matchPhase` и `registrationOpen`.** При версии 1 редактирование/запись доступны только без startedAt/completedAt при raw collecting/scheduled. Для версии 0 оставить прежнюю ветку. Не менять `matchStartsAt` и расчёт тихих часов.
- [ ] **Step 6: Проверить и зафиксировать.** Run `pnpm --filter @altynka/core test` и `pnpm --filter @altynka/core typecheck`; ожидается PASS. Commit только перечисленных файлов: `feat(core): define game rotation and manual match phases`.

## Task 2: Добавочная миграция и атомарное хранение протокола

**Files:** Modify `apps/worker/src/db/schema.ts`, `apps/worker/migrations/meta/_journal.json`, `apps/worker/src/domain/events.ts`, `package.json`; create `apps/worker/migrations/0011_game_statistics.sql`, соответствующий snapshot метаданных, `apps/worker/src/domain/gameStore.ts`, `apps/worker/test/domain/gameStore.test.ts`, `scripts/game-statistics-migration.test.mjs`.

**Interfaces:**
- Consumes: `GameState`, `GameMutationMeta`, существующие `Db`, `Deps`, `EventRow`.
- Produces: колонки events `protocol_version` INTEGER NOT NULL DEFAULT 0, `started_at`/`completed_at` nullable INTEGER, `game_revision` INTEGER NOT NULL DEFAULT 0, `roster_revision` INTEGER NOT NULL DEFAULT 0, `game_state_json` nullable TEXT. Drizzle-поля в camelCase, JSON хранит `GameState`.
- `loadGameState(db: Db, eventId: number): Promise<GameState|null>`; `commitGameCommand(d: Deps, ev: EventRow, meta: GameMutationMeta, command: GameStoredCommand): Promise<GameCommitResult>`.
- `GameStoredCommand`: fingerprint, state: GameState, startedAt, completedAt, optional status. `GameCommitResult`: `{kind:'ok', appliedRevision:number, duplicate:boolean}|{kind:'conflict'|'not_found'}`. Внешний сервис отдельно проверяет фазу/права и строит DTO.

- [ ] **Step 1: Написать тест миграции на SQLite в памяти.** Применить 0000–0010, создать collecting/scheduled/billing/closed события, счета, гостей и опрос; применить 0011. Assert: все прежние строки/ID/суммы/статусы сохранены, protocolVersion=0, started/completed/state null. Проверить JSON/check-ограничения, foreign_key_check; после старта версии 1 INSERT/UPDATE/DELETE signups и team_assignments запрещены, для версии 0 действуют прежние правила.
- [ ] **Step 2: Запустить тест до миграции.** Run `node --test scripts/game-statistics-migration.test.mjs`; ожидается отсутствие 0011.
- [ ] **Step 3: Добавить миграцию, Drizzle-поля и защитные триггеры.** `game_state_json` обязан быть валидным JSON, когда не null; completedAt требует startedAt, startedAt требует состояния и версии 1. Триггеры signups/team_assignments увеличивают `roster_revision` после подготовительных изменений и запрещают изменения после старта версии 1. Учесть обе eventId при переносе строки UPDATE. Защитить event-поля подготовки (teamCount, baseLimit, teamsRoster, ratingSnapshot, teamsPublishedAt, date/startTime/durationHours/place) от изменений после старта версии 1; финансовый статус и протокол допускаются. Составы/лимит/публикация до старта увеличивают rosterRevision. В `createEvent` явно писать protocolVersion=1; SQL default остаётся 0 для старых записей/фикстур.
- [ ] **Step 4: Добавить тест CAS/receipt и проверить падение.** Пара конкурентных UPDATE с одной ревизией даёт один успех; retry того же requestId после другой команды возвращает original appliedRevision; другой fingerprint даёт conflict. Run `pnpm --filter @altynka/worker test -- test/domain/gameStore.test.ts`; ожидается отсутствие модуля.
- [ ] **Step 5: Реализовать CAS.** Сохранение использует один UPDATE events с WHERE id/game_revision и, для старта, roster_revision/status/started_at. Если команда меняет raw status, условие также сравнивает прочитанный status: конкурентное закрытие bill не должно быть затёрто завершением встречи со старым статусом. Результат, следующая пара, receipt, timestamps и revision изменяются одной операцией. При неуспехе перечитать строку и проверить receipt, затем вернуть conflict. Не считать последующий SyncPort запрос частью атомарной записи; его ошибку допускается повторить по receipt.
- [ ] **Step 6: Проверить и зафиксировать.** Добавить script `test:migrations:games` и включить новый тест в `test:migrations` рядом с прежним. Run `pnpm test:migrations`, targeted worker test и worker typecheck; ожидается PASS. Commit `feat(db): add versioned atomic game protocol storage`.

## Task 3: Ручной старт и защита подготовленных составов

**Files:** Create `apps/worker/src/domain/gameStart.ts`, `apps/worker/src/api/games.ts`, `apps/worker/test/domain/gameStart.test.ts`, `apps/worker/test/api/games.test.ts`; modify `apps/worker/src/domain/{events,teams}.ts`, `apps/worker/src/api/routes.ts`, `apps/worker/test/domain/lifecycle.test.ts`.

**Interfaces:**
- Consumes: Task 1 rules, Task 2 CAS, existing `teamsDto`, `loadQueue`, `canManage`, `SyncPort`.
- Produces: `startGameSession(d: Deps, eventId: number, actorId: number, meta: GameMutationMeta): Promise<GameCommandResult>`; `getGameProtocol(d: Deps, eventId: number, canManage: boolean): Promise<GameProtocolDto|null>`.
- `GameCommandResult`: `{kind:'ok', protocol:GameProtocolDto, appliedRevision:number}|{kind:'invalid'|'stale'|'not_started'|'completed'|'closed'|'conflict'|'not_found', reason?:string}`; HTTP maps invalid→400, not_found→404, remaining non-ok→409. Auth middleware supplies 403 for a member without organizer rights.
- API: GET `/events/:id/games` и POST `/events/:id/games/start` с `{requestId,expectedRevision}`; writes require organizer. Successful mutation returns `{protocol,appliedRevision}`.

- [ ] **Step 1: Написать доменные/API тесты старта.** Нельзя стартовать collecting/cancelled/legacy, до даты встречи, со stale/неопубликованными/пустыми командами или резервистом в снимке. Разрешить раньше назначенного часа в день встречи и позже назначенного часа. Проверить неизменность имён после смены профиля, гостя с userId=null, повтор старта с новым requestId без новой жеребьёвки. Участник читает, чужая группа получает 404, обычный игрок не стартует.
- [ ] **Step 2: Проверить падение.** Run `pnpm --filter @altynka/worker test -- test/domain/gameStart.test.ts test/api/games.test.ts`.
- [ ] **Step 3: Реализовать старт и чтение DTO.** До сборки снимка читать rosterRevision; валидировать очередь и опубликованные назначения; записать snapshot, initialPair/currentPair, timestamps и receipt условным UPDATE по прочитанной ревизии. Если rosterRevision изменился, вернуть stale, не сохранять устаревший снимок. У уже начатой встречи вернуть существующий старт; несовпадающий payload под прежним requestId остаётся conflict. Подключить routes в существующий `/events/:id/*` scope.
- [ ] **Step 4: Обновить подготовительные операции и добавить тест гонки.** До старта версии 1 оставить запись/гостей/обмены открытыми после назначенного часа. После старта сервер отвергает join/leave/addGuest/removeSignup/saveTeams/publishTeams/schedule/cancel. Условные записи и SQL-триггеры не позволяют пройти через устаревшую предварительную проверку. В тесте удержать старт после чтения rosterRevision, выполнить удаление гостя или обмен, продолжить старт и проверить stale; обратный порядок даёт отказ редактирования без частичного DELETE состава. Ожидаемую ошибку триггера преобразовать в доменный closed/stale, не 500.
- [ ] **Step 5: Проверить и зафиксировать.** Run targeted tests плюс `test/domain/events.test.ts`, `test/domain/teams.test.ts`, `test/api/lifecycle.test.ts`, worker typecheck; ожидается PASS с прежними legacy-фикстурами. Commit `feat(worker): start sessions manually and freeze lineups`.

## Task 4: Запись, исправления и отмена результата

**Files:** Create `apps/worker/src/domain/games.ts`, `apps/worker/test/domain/games.test.ts`; modify `apps/worker/src/api/games.ts`, `apps/worker/test/api/games.test.ts`.

**Interfaces:**
- Consumes: DTO/validation/rules Task 1, CAS Task 2, reader Task 3.
- Produces: `recordGameResult(d: Deps, eventId: number, actorId: number, meta: GameMutationMeta, input: GameResultInput): Promise<GameCommandResult>`; `editGameResult(d: Deps, eventId: number, gameId: string, actorId: number, meta: GameMutationMeta, input: GameResultInput): Promise<GameCommandResult>`; `undoLastGame(d: Deps, eventId: number, actorId: number, meta: GameMutationMeta): Promise<GameCommandResult>`.
- Routes: POST `/events/:id/games/results`, PATCH `/events/:id/games/results/:gameId`, POST `/events/:id/games/undo`; body `{...meta,...input}` или meta для undo. Пара определяется сервером, клиент не выбирает соперников при записи.

- [ ] **Step 1: Написать тесты протокола.** Проверить обе победы/первую ничью с выбранной игравшей командой, 0:0, дубли scorer signupId, отрицательные/дробные/небезопасные числа, автора чужой команды/встречи, превышение голов; неизвестные голы разрешены. При несовпадающих firstRestTeamIndex и победителе вернуть invalid; при двух командах поле не требуется. Вторая ничья не запрашивает сулифа.
- [ ] **Step 2: Написать тесты повторов/коррекции и проверить падение.** Две записи с одним expectedRevision дают одну игру. Потерянный ответ первой команды → вторая игра сохранена → повтор первой команды не создаёт третью. После исправления первой игры до второй пересчитать вторую пару; после второй сохранить её pair и firstRestTeamIndex как историческое решение. Отмена последней возвращает её pair, sequence переиспользуем, ID нет. После completed запись/undo запрещены, edit разрешён. Run `pnpm --filter @altynka/worker test -- test/domain/games.test.ts test/api/games.test.ts`.
- [ ] **Step 3: Реализовать команды и Zod-валидацию.** Нормализовать scorer entries по signupId для fingerprint, отклонять дубликаты вместо неявного суммирования. Score/count — safe nonnegative integers, число голов автора положительное, сумма авторов не выше результата стороны. Сохранять recordedBy/At и updatedBy/At; edit не меняет id/sequence/pair. При первом результате записать фактически севшую команду; исправление после второй игры не пересоздаёт этот выбор. Undo последней удаляет результат и восстанавливает прежнюю пару/доступность выбора сулифа.
- [ ] **Step 4: Подключить API и проверить авторизацию всех операций.** Разрешить read всей группе, writes только её organizer/admin, проверить gameId принадлежит указанному event. Ошибка sync после коммита не откатывает запись; повтор команды безопасно повторяет запрос синхронизации.
- [ ] **Step 5: Проверить и зафиксировать.** Run оба targeted test suites и worker typecheck; ожидается PASS. Commit `feat(worker): record and correct short game results`.

## Task 5: Завершение, расчёт, ленты и сообщения бота

**Files:** Modify `apps/worker/src/domain/{games,bills,ratings,eventView}.ts`, `apps/worker/src/api/{games,ratings}.ts`, `apps/worker/src/sync/{parts,EventSync,automatic}.ts`, `apps/worker/src/render/eventMessage.ts`, `apps/worker/src/bot/private.ts`; tests `domain/{games,bills,ratings,lifecycle}.test.ts`, `api/{games,lifecycle,ratings}.test.ts`, `sync/{EventSync,automatic}.test.ts`, `render/eventMessage.test.ts`, `bot/{bot,private}.test.ts`.

**Interfaces:**
- Consumes: versioned phase, immutable roster, CAS; legacy review tables/triggers and bills remain.
- Produces: `finishGameSession(d: Deps, eventId: number, actorId: number, meta: GameMutationMeta, participantSignupIds: number[]): Promise<GameCommandResult>` and POST `/events/:id/games/finish`. Old POST `/events/:id/finish` stays for legacy and returns 409 `use_game_finish` for version 1.
- Для версии 1 опрос создаётся из сохранённой команды finish, а не из нового списка при retry. Новый helper `ensureGameReview(d: Deps, eventId: number): Promise<void>` в `domain/ratings.ts` читает completedAt и зафиксированные при finish IDs; его безопасно вызывать при повторе finish и через EventSync.

- [ ] **Step 1: Написать тесты завершения.** До старта finish/bill запрещены. После старта bill доступен; закрыть его, записать ещё игру, найти встречу в active и завершить. Добавить конкурентное закрытие bill во время finish: итог не становится billing при закрытом bill. completedAt и список участников неизменны при повторе finish. При нуле результатов допустимы пустой список (без review) и непустой (review есть); при существующих результатах пустой список invalid. Finish без bill переводит raw status в closed; с открытым bill — billing. Правка результата после finish разрешена без открытия новых игр.
- [ ] **Step 2: Написать регрессии версии 0 и проверить падение новых тестов.** Оставить автоматический старый старт/счёт/опрос; показать legacy вместо нулевой таблицы. Run targeted lifecycle/games/bills/ratings tests.
- [ ] **Step 3: Реализовать finish без раздвоения состояния.** Одним CAS сохранить completedAt, receipt, подтверждённые IDs в GameState (добавить `finishParticipants: number[]|null`) и raw financial status. Затем idempotent helper создаёт review с тем же completedAt/окном 72 часа и существующим триггером участников, если список непуст. Если создание review временно упало, finish retry и EventSync доводят его до готовности; read не должен выдавать ложное `legacy` для ожидающего review. Добавить вызов helper в sync до расчёта review-уведомлений. Пустой список не создаёт review: его summary имеет state=ineligible, completedAt из events, closesAt=null и canFinish=false. Для версии 1 старый canFinishMatch всегда false, возможность завершить возвращается через gameProtocol.canFinish. Составы и деньги не меняются.
- [ ] **Step 4: Обновить bills и ленты.** Для версии 1 проверять фактический startedAt, а не час на календаре; raw billing/closed не означает завершённый спорт. `listEvents`, `matchArchive`, групповой summary и приватный `/matches` должны учитывать protocolVersion/startedAt/completedAt. Незавершённая новая встреча не попадает в архив из-за оплаты; завершённая встреча без bill попадает. Не загружать JSON всех протоколов для построения ленты: использовать явную проекцию summary.
- [ ] **Step 5: Обновить sync/render и добавить тест сообщений.** Плановый kickoff версии 1 не пишет «Игра началась» и не блокирует кнопки; ручной старт обновляет event/teams. Наследовать фактическую phase в loadEventView. Не ставить бесконечный alarm на уже прошедшее назначенное время; для версии 0 сохранить старую синхронизацию. Scheduled reminder разрешён до реального старта и только до назначенного часа. При completed спорте показывать завершение и доступную оплату раздельно; существующие счета/платёжные напоминания работают.
- [ ] **Step 6: Проверить и зафиксировать.** Run worker full test suite и worker typecheck; ожидается PASS. Commit `feat(worker): integrate game sessions with billing reviews and bot`.

## Task 6: Подготовка и ручной старт в миниаппе

**Files:** Modify `apps/miniapp/src/screens/{Event,Teams,MatchParticipation,Matches,MatchRatings,Bill}.tsx`, `apps/miniapp/src/hooks/useMatchPhase.ts`, `apps/miniapp/src/components/MatchCard.tsx`, `apps/miniapp/src/lib/labels.ts`; tests `apps/miniapp/test/{Teams,MatchPage,Matches,Ratings,Bill}.test.tsx`.

**Interfaces:**
- Consumes: versioned summary/detail DTO и POST start/finish из предыдущих задач.
- Produces: организаторский старт из вкладки составов, использование gameProtocol permissions, согласованное отображение phase. Existing routes `list/teams/bill` сохраняются.

- [ ] **Step 1: Добавить компонентные тесты подготовки и проверить падение.** Сохранить обмен обычный↔гость и добавление/удаление гостя до старта, в том числе после назначенного времени. При stale показать просьбу обновить составы, старт недоступен. После старта исчезают действия редактирования для организатора и участия для игрока. Повтор клика не делает два requestId; 409 сохраняет контекст и предлагает обновление.
- [ ] **Step 2: Реализовать ручной старт и фазу.** Переиспользовать существующие Teams/ActionSheet/MatchAction. После опубликованных составов основное действие — «Начать встречу»; перед запросом подтвердить, что составы фиксируются на всю встречу. start создаёт requestId один раз на попытку и повторяет тот же после сетевой ошибки. После успеха reload и переход к игровому протоколу. useMatchPhase не запускает автоматический переход версии 1 по часам.
- [ ] **Step 3: Обновить связанные действия.** Bill использует фактический старт и отдельное состояние bill; после завершения спортивной части оплата доступна по bill permissions. MatchRatings для версии 1 не показывает прежнюю отдельную кнопку finish: завершение идёт из протокола, карточка опроса остаётся после его создания. У завершённой версии 1 с closesAt=null не показывать ссылку на несуществующий опрос; очередной reload может показать созданный через sync опрос. Matches/MatchCard показывают активный спорт при закрытой оплате и корректный архив. Legacy UI сохраняется.
- [ ] **Step 4: Проверить и зафиксировать.** Run `pnpm --filter @altynka/miniapp test -- test/Teams.test.tsx test/MatchPage.test.tsx test/Matches.test.tsx test/Ratings.test.tsx test/Bill.test.tsx` и miniapp typecheck; ожидается PASS. Commit `feat(miniapp): prepare lineups and start sessions manually`.

## Task 7: Игровой протокол, форма результата и итоги

**Files:** Create `apps/miniapp/src/screens/{MatchGames,GameResultSheet}.tsx`, `apps/miniapp/src/lib/gameDraft.ts`, `apps/miniapp/src/styles/games.css`, `apps/miniapp/test/{MatchGames,GameResultSheet}.test.tsx`, `apps/miniapp/test/gameDraft.test.ts`; modify `screens/Event.tsx`, `styles/app.css`.

**Interfaces:**
- Consumes: `GameProtocolDto`, API command bodies; existing ActionSheet, useResource, api, toast, MatchAction.
- Produces: `MatchGames({ev,reload}: {ev:EventDetailDto;reload:()=>void})`, `GameResultSheet({ev,protocol,game,onClose,onSaved})` (game null для новой записи).
- `gameDraft.ts`: `readGameDraft(eventId:number, userId:number): GameResultDraft|null`, `writeGameDraft(eventId:number,userId:number,draft:GameResultDraft):void`, `clearGameDraft(eventId:number,userId:number):void`. Draft включает pair/gameId, revision, requestId и input; ключ разделён по пользователю и event, без телефона/платёжных данных.

- [ ] **Step 1: Добавить тесты представления и формы и проверить падение.** Игрок видит текущую пару, отдых, историю, таблицу и бомбардиров без организаторских действий. Организатор вводит 2:1 и авторов из своих команд, несколько голов гостя, 0:0 и первую ничью с обязательным выбором отдыхающего. Показать остаток «Автор не указан: N». При последующих ничьих выбор сулифа отсутствует. Legacy показывает отсутствие протокола.
- [ ] **Step 2: Подключить раздел «Игра» (`?tab=games`).** Для версии 1 добавить вкладку между «Составы» и «Оплата», сохранить старые URL и клавиатурную навигацию. Четыре вкладки помещаются на 320 px без горизонтального выхода; списки/таблица имеют читаемые заголовки. Порядок раздела: текущая пара и действие → таблица → результаты → бомбардиры; подробные составы остаются в существующей вкладке.
- [ ] **Step 3: Реализовать запись и редактирование.** Использовать ввод числового результата и выбор количества голов рядом с именем из снимка, без поиска по общему каталогу игроков. Форма в ActionSheet с закреплённым «Сохранить результат»; победитель вычисляется, отдельного выбора нет. Сетевой сбой оставляет ввод; конфликт требует reload и явной сверки черновика с новой парой. Никогда не переносить черновик молча на следующих соперников. При правке первой игры заранее показать изменение второй пары либо сохранение исторических соперников согласно Task 4.
- [ ] **Step 4: Реализовать черновики и тест восстановления.** Сохранять после изменения формы. При перезагрузке восстанавливать только совпадающие user/event/game/pair. При потере ответа сохранять requestId для безопасного retry; receipt success очищает draft даже если сервер уже ушёл к следующей паре. Недоступный storage не ломает ввод. Run focused miniapp tests, ожидается PASS.
- [ ] **Step 5: Добавить завершение и отмену последней записи.** Организаторские действия в меню протокола; отмена показывает, какой результат убирается. Завершение предлагает участников из снимка с возможностью исключить неигравших и пустым списком при нуле результатов; после успеха показываются итоги и существующий опрос. После completed остаются правки результатов/авторов, без record/undo. При нуле игр не показывать победителя.
- [ ] **Step 6: Проверить и зафиксировать.** Run miniapp tests, `pnpm typecheck`, `pnpm build`; ожидается PASS. Commit `feat(miniapp): record games and display standings and scorers`.

## Task 8: Проверка всего сценария и документация выпуска

**Files:** Create `tests/ui/game-statistics.spec.ts`, `tests/ui/game-statistics-fixture.ts`, `docs/game-statistics-review.md`; modify `tests/ui/match-lifecycle.spec.ts` (сохранить legacy-сценарии), `README.md`, `docs/README.md`.

**Interfaces:**
- Consumes: окончательная реализация Tasks 1–7. UI-фикстура должна менять состояние по командам, а не возвращать неизменный mock; worker API-тесты уже проверяют настоящие D1-операции.
- Produces: проверяемые сценарии, обзор изменений и конкретный порядок будущего развёртывания без самого деплоя.

- [ ] **Step 1: Добавить браузерный сценарий трёх команд.** Опубликованные составы → обмен игрока с гостем → ручной старт → первая ничья 0:0 → выбор севшей команды → следующие три игры с победами/ничьёй. Assert точных пар, отдыха, очков и голов, включая гостя с двумя голами. Refresh восстанавливает очередь; после старта редактирование составов недоступно.
- [ ] **Step 2: Добавить браузерные сценарии ошибок и оплаты.** Потерять первый ответ после принятой записи, retry не создаёт дубликат. Открыть два организаторских контекста, устаревшая ревизия получает понятный конфликт. Закрыть bill до окончания, убедиться в active, внести результат и завершить. Отдельно пройти две команды, отмену последней записи, исправление первой после второй и legacy-встречу.
- [ ] **Step 3: Провести визуальную/доступностную проверку.** 320×568 и 390×844, обе темы, клавиатура и reduced motion; длинные/одинаковые имена гостей, пустая таблица, много результатов, ошибки API, открытая клавиатура телефона, прокрутка над sticky action. Снять и просмотреть скриншоты; применить подходящие UI-навыки при реализации/проверке и исправить найденное. Axe по существующему образцу тестов.
- [ ] **Step 4: Выполнить итоговые проверки.** Run `pnpm test:migrations`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm exec playwright test`. Ожидается PASS. Повторять только затронутые проверки после последующих исправлений; записать реальные результаты и ограничения в review-документ.
- [ ] **Step 5: Описать обновление и зафиксировать.** README: ручной старт для новых встреч, ротация/сулифа, протокол/гости/неизвестные авторы. Порядок будущего выпуска: сохранить экспорт D1 и версию Worker → приостановить создание встреч и изменения на время переключения → применить 0011 → развернуть совместимый Worker+miniapp → восстановить операции → проверить тестовую группу. До нового Worker default=0 безопасен для старых созданий; после первого события protocolVersion=1 возврат к старому коду без согласованной миграции запрещён, поскольку он может игнорировать блокировку составов и спортивный этап. Сам деплой не выполнять. Commit `test: verify game statistics lifecycle and document release`.

## Самопроверка плана

- Спецификация покрыта: подготовка/гости/ручной старт Tasks 2–3, 6; ротация/правила Task 1; ввод/исправления Task 4; итоги Task 1 и 7; оплата/завершение/опрос/бот Task 5; совместимость/миграция Tasks 2, 5, 8; UI/восстановление Tasks 6–8.
- Общие типы определены в Task 1 и разделе контракта; task-specific функции именованы в Interfaces. В Task 5 GameState расширяется сохранённым списком finishParticipants.
- Пять Review Focus имеют конкретные проверки в соответствующих задачах.
- Изменения намеренно используют один агрегат на встречу: текущий scope не требует SQL-аналитики сезонов, нормализованных событий каждого гола или нового коннектора.
- Во время выполнения отмечать завершённые checkbox шаги и реальные проверки; документ не свидетельствует о выполненной реализации.
