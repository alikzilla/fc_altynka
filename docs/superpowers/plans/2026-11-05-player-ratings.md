# Player ratings implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Анкета навыков, подтверждение участия, анонимные оценки и публичные игровые профили с единым рейтингом для составов.

**Architecture:** Общие контракты и расчёт в core; новые таблицы D1, серверные проверки и агрегаты в Worker; экраны и нижние окна в существующем React-приложении. Миграция сохраняет старые уровни и исключает ретроспективные опросы старых матчей.

**Tech Stack:** TypeScript, React, Wouter, Hono, Drizzle, D1, Vitest, Playwright.

**Spec:** docs/superpowers/specs/2026-11-05-player-ratings-design.md

## Global Constraints

- Восемь обязательных целочисленных ответов 1–10; общий рейтинг до десятых.
- R = (3 × S + сумма оценок до 10 последних допустимых матчей) / (3 + n).
- Публикация после 72 часов при минимум трёх голосах. Авторы и отдельные чужие голоса не выдаются.
- Анкета и рейтинг scoped к сообществу; гости не получают аккаунты или голоса.
- Сохранённые составы фиксируют рейтинги; финансовое закрытие не подтверждает участие.
- Существующий дизайн, темы, доступность и стек сохраняются. Без деплоя.

## Review Focus

- Одновременные повторные запросы не дублируют анкеты, завершения или голоса.
- Нельзя голосовать без фактического участия или за другого пользователя с помощью подмены JSON.
- В момент deadline результаты открываются без зависимости от cron; голоса на границе закрытия отклоняются.
- Публичные DTO не раскрывают телефон, автора, индивидуальные чужие голоса или малые выборки.
- Старые матчи и сохранённые составы продолжают работать после миграции.

### Task 1: Rating contracts and arithmetic

**Files:** `packages/core/src/ratings.ts`, `api.ts`, `index.ts`, `teams.ts`; `packages/core/test/ratings.test.ts`, `teams.test.ts`.
**Interfaces:** `SKILLS`, `SkillAnswers`, `PlayerRatingDto`, `PlayerProfileDto`, `MatchReviewDto`, `calculatePlayerRating(initial, matches)`, `selfAssessmentRating(answers)`, `formatRating(value)`.

- [x] Написать тесты формулы, округления, 10/11 матчей, порога и десятичных команд; запустить и увидеть ошибки отсутствующей реализации.
- [x] Реализовать общий расчёт и типы; суммы алгоритма сравнивать в целых десятых.
- [x] Запустить core tests и typecheck; ожидать PASS.

### Task 2: Persistence and anonymous reviews

**Files:** новая миграция `apps/worker/migrations/0008_player_ratings.sql`, `db/schema.ts`, `domain/ratings.ts`, `api/ratings.ts`, `api/routes.ts`, `domain/events.ts`, `test/setup.ts`, `test/api/ratings.test.ts`.
**Interfaces:** `/api/me/skills` GET/PUT, `/api/players` GET, `/api/players/:id` GET, `/api/events/:id/finish` POST, `/api/events/:id/review` GET/POST. `playerRatings(db, communityId, now)` возвращает карту публичных игровых сводок, `matchReview(...)` — публичную сводку и только собственную отправленную анкету.

- [x] API tests: анкета, одно заполнение, завершение и snapshot, фактическое участие, запрет self/guest/cross-community, неизменность и идемпотентность отправки, срок 72 часа, ≥3 голоса, закрытые и старые игры. Сначала RED.
- [x] Добавить таблицы с CHECK/FK/unique; атомарные вставки завершения и опроса. Нормализованные голоса создаются SQL trigger из проверенного payload одной вставкой опроса.
- [x] Реализовать пакетные SQL-агрегаты, публичные DTO и роуты; не отдавать payload другого автора.
- [x] Обновить очистку тестовой БД; запустить worker API tests и typecheck, ожидать PASS.

### Task 3: Team ratings and obligations integration

**Files:** `domain/eventView.ts`, `domain/teams.ts`, `api/members.ts`, `api/notifications.ts`, `test/domain/teams.test.ts`, `test/api/ratings.test.ts`.
**Interfaces:** `MeDto.rating`, `EventDetailDto.review`, `TeamsDto.ratingSnapshot`, новые задачи `skills` и `review`. Организаторский `SignupDto.level` получает текущий рейтинг или snapshot сохранённых составов.

- [x] Тесты: единый рейтинг в Me/profile/event, frozen snapshot, новый расклад получает новые значения, задачи анкеты/отзыва, отсутствие сырых голосов. Сначала RED.
- [x] Встроить рейтинги, флаг включения в новых матчах, snapshot при сохранении составов; оставить старые поля как fallback. Административное изменение вычисляемого уровня запретить.
- [x] Расширить задачи без зависимости от оплаты и без новых Telegram-сообщений.
- [x] Запустить Worker/core regression tests и typecheck; ожидать PASS.

### Task 4: Questionnaire and player profiles

**Files:** `screens/SkillAssessment.tsx`, `screens/Players.tsx`, `screens/PlayerProfile.tsx`, `components/PlayerRating.tsx`, `screens/Profile.tsx`, `App.tsx`, `styles/ratings.css`, соответствующие miniapp tests.
**Interfaces:** `/profile/skills`, `/players`, `/players/:id`; `PlayerProfileSheet({userId,onClose})` для списка и матча. Анкета один вопрос за раз с финальной сводкой, без предвыбранных ответов.

- [x] Тесты отсутствующих ответов, прогресса, сводки, повтора/сбоя, публичных профилей и отсутствия личных платёжных данных. Сначала RED.
- [x] Реализовать шкалу 1–10, стартовое предложение с откладыванием, статистику своего профиля, поиск игроков и окно профиля. Роли редактируются отдельно, редактор уровня удаляется.
- [x] Использовать текущие темы, ActionSheet и правила доступности. Нет вымышленных графиков.
- [x] Запустить miniapp tests и typecheck; ожидать PASS.

### Task 5: Match finish and review flow

**Files:** `screens/MatchReview.tsx`, `screens/MatchRatings.tsx`, `screens/Event.tsx`, `screens/EventList.tsx`, `screens/Teams.tsx`, `components/TaskCard.tsx`, `screens/Notifications.tsx`, `App.tsx`, miniapp tests.
**Interfaces:** `/event/:id/review`; `MatchRatings({ev,reload})` с подтверждением участников; задачи ведут на существующие и новые маршруты.

- [x] Тесты выбора основы/резерва, запрета self-review, необязательных оценок, явного пропуска, окончательной отправки и закрытого срока. Сначала RED.
- [x] Реализовать завершение в нижнем окне, опрос, итоговые состояния и переходы к профилям из участников/составов.
- [x] Форматировать все уровни/суммы до десятых и сохранять уже опубликованные команды.
- [x] Запустить miniapp tests, Worker regression tests и typecheck; ожидать PASS.

### Task 6: Browser validation and final review

**Files:** `tests/ui/player-ratings.spec.ts`, документация проекта/дизайна.

- [x] Браузерные сценарии: анкета → рейтинг → профиль, поиск/шторка/Back, завершение → опрос → отправлено, недостаточно оценок; 320/390/768/1440, обе темы, keyboard. Моки только в тестах.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm build`, релевантные Playwright tests; ожидать PASS.
- [x] Открыть скриншоты новых экранов, исправить переполнение и состояния; проверить сеть/консоль.
- [x] Независимый итоговый code review, исправить существенные замечания с RED→GREEN, обновить документацию и сообщить проверенный результат без деплоя.


## Итог выполнения

382 unit/API tests, 100 browser tests (1 существующий skip), typecheck, production
build и diff-check прошли. Независимый reviewer выявил два P2, оба воспроизведены
и исправлены (late survey navigation, silent rating resnapshot on republish).
Подробности и артефакты — `docs/player-ratings-review.md`. Ветка сохранена локально;
миграция production, деплой, merge и push не выполнялись.
