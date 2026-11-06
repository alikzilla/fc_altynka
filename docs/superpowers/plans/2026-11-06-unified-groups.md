# Несколько групп без «выбранной команды» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Приложение принадлежит человеку: общий профиль и рейтинг, общая лента по всем его группам, выбор группы только при создании матча, если таких групп несколько.

**Architecture:** Заголовок `X-Community-Id` и глобальный `communityMiddleware` уходят. Маршруты «про объект» (`/events/:id…`, `/bills/:id…`, `/bill-lines/:id`, `/signups/:id`, `/members…`) получают группу из объекта (или из `?communityId=`) через новый `scopeCommunity(resolve)` и дальше работают как раньше (`c.get('community')`, `c.get('role')`, `requireRole`). Маршруты «про человека» работают по списку активных членств. Профиль возвращается в `users`, самооценка становится одной на человека, рейтинг считается по участию во всех группах.

**Tech Stack:** Cloudflare Workers + Hono + Drizzle (D1/SQLite), vitest + `@cloudflare/vitest-pool-workers`; React 19 + wouter + TanStack Query (Telegram Mini App), vitest + Testing Library; grammY; Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-unified-groups-design.md` (читать целиком перед любой задачей). Права внутри группы, `/bind`, доступ к счетам — из `docs/superpowers/specs/2026-11-06-multiple-groups-design.md`, они не меняются.

## Global Constraints

- Ветка `feat/venue-picker`, в рабочем дереве много незакоммиченной работы Codex. Коммитить только файлы своей задачи (`git add <пути>`), никогда `git add -A`.
- Миграция `0009_multiple_groups.sql` не применена в production — её **переписывают**, новую миграцию поверх не добавляют.
- Профильные поля живут только в `users`: `displayName`, `kaspiPhone`, `profileCompletedAt`, `playingPosition`, `dominantFoot`, `notificationsEnabled`.
- Роль (`player | organizer | admin`) — по-прежнему своя в каждой группе (`effectiveRole(env, user, membership)`).
- Если у человека ≤ 1 группы: ни подписи группы, ни поля «Группа», ни плашки — интерфейс как до мультигрупп.
- Объект чужой группы → `404` (как сейчас); явный `communityId` чужой группы → `403`.
- Копирайт на русском. Выбор группы — список по строке с радиокнопкой, без выбора по умолчанию.
- Проверки перед коммитом каждой задачи: `pnpm --filter @altynka/worker test`, `pnpm --filter @altynka/miniapp test`, `pnpm typecheck` — все зелёные. Исключение: Task 1–3 меняют схему и домен воркера, и `typecheck`/тесты API воркера остаются красными до конца Task 4; в этих задачах прогоняются только перечисленные в них тесты.
- Перед Task 1 зафиксировать базовую линию: `pnpm test && pnpm typecheck` на текущем дереве; уже падающие тесты записать и не считать регрессией.

## Review Focus

1. Человек вышел из группы с неоплаченным долгом → долг остаётся в «Задачах», его можно отметить оплаченным (тест в Task 4).
2. Человек вышел из группы → его рейтинг не изменился, своя история матчей той группы осталась (тест в Task 3).
3. Новый игрок открыл приложение по кнопке `c{id}_matches` из группы, где его ещё нет в `memberships` → после входа видит матчи этой группы (тесты в Task 4 и Task 6).
4. Организатор группы A шлёт `POST /api/events` с `communityId` группы B, где он игрок или не участник → `403`, матч не создан (тест в Task 4).
5. Админ Telegram группы A открывает экран «Игроки»: управление ролями есть только в разделе A, `PATCH /api/members/:id?communityId=B` → `403` (тесты в Task 4 и Task 7).

---

### Task 1: Схема и миграция

**Files:**
- Modify: `apps/worker/src/db/schema.ts` (`memberships`, `skillAssessments`)
- Delete + regenerate: `apps/worker/migrations/0009_multiple_groups.sql`, `apps/worker/migrations/meta/0009_snapshot.json`, запись idx 9 в `apps/worker/migrations/meta/_journal.json`
- Modify: `scripts/multiple-groups-migration.test.mjs`

**Interfaces:**
- Produces: `memberships` без колонок `display_name, kaspi_phone, profile_completed_at, playing_position, dominant_foot, notifications_enabled` (остаются `active`, `telegram_admin`, `legacy`); `skill_assessments` без `community_id`, `PRIMARY KEY(user_id)`.

- [ ] **Step 1: Переписать тест миграции** `scripts/multiple-groups-migration.test.mjs`. Сценарий: применить `0000`–`0008`, вставить community 1 и 2, user 1 (профиль в `users`), memberships (1,1,'organizer',7) и (2,1,'player',3), две анкеты `skill_assessments` для user 1 (community 1 `created_at=100`, `teamwork=3`; community 2 `created_at=200`, `teamwork=8`), событие/счёт как сейчас; применить `0009`. Утверждения:
  ```js
  assert.equal(db.prepare('SELECT count(*) n FROM skill_assessments WHERE user_id=1').get().n, 1);
  assert.equal(db.prepare('SELECT teamwork FROM skill_assessments WHERE user_id=1').get().teamwork, 8); // самая свежая
  assert.equal(member.legacy, 1); assert.equal(member.role, 'organizer'); assert.equal(member.level, 7);
  assert.ok(!('display_name' in member)); assert.ok(!('kaspi_phone' in member));
  assert.equal(db.prepare('SELECT display_name FROM users WHERE id=1').get().display_name, 'Captain');
  ```
- [ ] **Step 2:** `pnpm test:migrations` → FAIL (старая 0009 добавляет `display_name`, анкет две).
- [ ] **Step 3: Схема.** Удалить шесть профильных колонок из `memberships`; в `skillAssessments` удалить `communityId`, первичный ключ — `userId` (`userId: integer('user_id').primaryKey().references(() => users.id)`), check-констрейнты сохранить.
- [ ] **Step 4: Миграция.** Удалить 0009 (sql, snapshot, запись журнала), выполнить `pnpm --filter @altynka/worker exec drizzle-kit generate --name multiple_groups`. В сгенерированном SQL:
  - после `ALTER TABLE memberships ADD legacy …` добавить `UPDATE memberships SET legacy = 1;--> statement-breakpoint`;
  - в пересоздании `skill_assessments` заменить `INSERT INTO __new_skill_assessments … SELECT … FROM skill_assessments` на выборку самой свежей анкеты на пользователя:
    ```sql
    INSERT INTO `__new_skill_assessments`(user_id, version, teamwork, dribbling, technique, shooting, stamina, physical, passing, defending, created_at)
    SELECT user_id, version, teamwork, dribbling, technique, shooting, stamina, physical, passing, defending, created_at FROM (
      SELECT *, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, community_id DESC) rn FROM skill_assessments
    ) WHERE rn = 1;
    ```
  - сохранить `CREATE INDEX memberships_user …`, если drizzle его не сгенерировал.
- [ ] **Step 5:** `pnpm test:migrations` → PASS.
- [ ] **Step 6:** Код воркера ещё ссылается на удалённые колонки — `typecheck` здесь красный, это ожидаемо; тесты воркера в этой задаче не запускать. Коммит:
  ```bash
  git add apps/worker/src/db/schema.ts apps/worker/migrations scripts/multiple-groups-migration.test.mjs
  git commit -m "feat(db): keep profile on users, one skill assessment per user"
  ```

### Task 2: Общий профиль в домене

**Files:**
- Modify: `apps/worker/src/domain/members.ts` (`memberUser`, `communityUser`, `takenNames`, `nameTaken`, `ensureMembership`, `upsertTgUser`)
- Modify: `apps/worker/src/sync/parts.ts` (`usersById`), `apps/worker/src/sync/billPart.ts`, `apps/worker/src/sync/personal.ts`, `apps/worker/src/domain/bills.ts`, `apps/worker/src/domain/eventView.ts`, `apps/worker/src/domain/ratings.ts:76`, `apps/worker/src/bot/bot.ts:131`, `apps/worker/src/api/notifications.ts` (`receiverName`), `apps/worker/src/auth/middleware.ts:59`
- Modify: `apps/worker/test/helpers.ts` (`seedUser`, `setMemberProfile`, `localUser`)
- Test: `apps/worker/test/domain/members.test.ts`, `apps/worker/test/domain/multipleGroups.test.ts`

**Interfaces:**
- Produces:
  - `memberUser` и `communityUser` **удаляются**. Профиль — это строка `users`.
  - `usersById(db: Db, ids: number[]): Promise<Map<number, UserRow>>` — без `communityId`.
  - `peerUserIds(db: Db, userId: number): Promise<number[]>` — id всех, с кем у человека есть общая активная группа (активное членство обоих, `communities.active`).
  - `nameTaken(db: Db, name: string, userId: number): Promise<boolean>` — совпадение имени (`nameKey`) с кем-то из `peerUserIds`, кроме самого `userId`.
  - `ensureMembership(db, communityId, userId, checkedAt?)` больше не пишет имя.
  - `upsertTgUser`: имя по умолчанию для нового пользователя без суффикса (разведение «Данияр 2» больше не нужно глобально).
  - helpers: `setMemberProfile(userId, fields)` и `localUser(userId)` работают с `users` (параметр `communityId` удалить).

- [ ] **Step 1: Тесты** в `test/domain/multipleGroups.test.ts`:
  - `name check only sees people who share a group` — A: Алихан(u1), Дамир(u2); B: Алихан(u1), Ербол(u3); C: «Тимур»(u4) без общих групп с u1. `nameTaken(db,'дамир',u3)` → `false` (u3 и u2 не пересекаются), `nameTaken(db,'Дамир',u1)` → `true`, `nameTaken(db,'тимур',u1)` → `false`.
  - `profile is shared across groups` — `setMemberProfile(u1,{kaspiPhone:'+77011234567'})`, затем `usersById(db,[u1])` → тот же телефон; членства в A и B не содержат профильных полей.
- [ ] **Step 2:** `pnpm --filter @altynka/worker exec vitest run test/domain/multipleGroups.test.ts` → FAIL.
- [ ] **Step 3: Реализация.** Все места из списка Files читают профиль из `users` (джойн с `memberships` только там, где нужен фильтр по группе, например получатели уведомлений группы). `personal.ts` берёт `notificationsEnabled` из `users`. Удалить тесты, которые проверяют «локальный профиль в каждой группе» (в `test/domain/multipleGroups.test.ts`, `test/api/multipleGroups.test.ts` — `editing local profile…`, `admin renaming a shared player only changes the local roster`), их заменят тесты Task 4.
- [ ] **Step 4:** тесты из Step 1 → PASS; `pnpm --filter @altynka/worker exec tsc --noEmit` — ошибки остаются только в `api/*` и `domain/ratings.ts` (их чинят Task 3–4).
- [ ] **Step 5:** Коммит (`git add` перечисленных файлов) — `feat(worker): single shared profile`.

### Task 3: Общий рейтинг

**Files:**
- Modify: `apps/worker/src/domain/ratings.ts` (`playerRatings`, `playerProfile`), `apps/worker/src/domain/teams.ts:31`, `apps/worker/src/domain/eventView.ts:97`
- Modify: `packages/core/src/ratings.ts` (`PlayerProfileDto.history`)
- Test: `apps/worker/test/domain/ratings.test.ts` (создать, если нет; иначе дописать в `test/api/ratings.test.ts`)

**Interfaces:**
- Produces:
  - `playerRatings(db: Db, userIds: number[], now: number): Promise<Map<number, PlayerSummaryDto>>`. `initial` = самооценка (одна на пользователя) или `Math.round(avg(memberships.level))` по **активным** членствам, иначе `5`. Матчи — последние 10 оценённых (`MIN_REVIEW_VOTES`, `closes_at <= now`, `status <> 'cancelled'`) по **всем** группам, независимо от текущего членства.
  - `playerProfile(db: Db, userId: number, viewerId: number, now: number): Promise<PlayerProfileDto | null>`. `null`, если `userId !== viewerId` и `userId` нет в `peerUserIds(db, viewerId)`. История: свой профиль — все матчи участия; чужой — только матчи групп, где у смотрящего сейчас активное членство.
  - `PlayerProfileDto['history'][number]` получает `community: { id: number; title: string }`.

- [ ] **Step 1: Тесты:**
  - `rating counts matches from every group` — u1 в A и B, по одному оценённому матчу в каждой (3 голоса по 9 в A, 3 по 5 в B) → `matchesCount === 2`, значение то же, что `calculatePlayerRating(initial, [обе игры])`.
  - `leaving a group keeps rating and own history` — после `memberships.active=false` в B: `playerRatings(db,[u1],now)` даёт то же значение; `playerProfile(db,u1,u1,now).history` всё ещё содержит матч B.
  - `foreign profile history is limited to shared groups` — u2 только в A: `playerProfile(db,u1,u2,now).history` содержит только матч A; u4 без общих групп → `null`.
  - `initial level averages active memberships` — уровни 4 и 7, без анкеты → `initial === 6` (`Math.round(5.5)`).
- [ ] **Step 2:** запустить → FAIL.
- [ ] **Step 3:** Реализация; `teams.ts` и `eventView.ts` передают id игроков из записей матча.
- [ ] **Step 4:** тесты → PASS.
- [ ] **Step 5:** Коммит — `feat(worker): one rating across groups`.

### Task 4: API без «текущей команды»

**Files:**
- Modify: `apps/worker/src/auth/middleware.ts` (удалить `communityMiddleware`, `authMiddleware`; добавить `scopeCommunity`), `apps/worker/src/api/routes.ts`
- Modify: `apps/worker/src/domain/members.ts` (`activeMemberships`, `confirmedMemberships`; `confirmedCommunities` удалить)
- Modify: `apps/worker/src/api/{communities,events,members,notifications,ratings,bills,teams}.ts`, `apps/worker/src/domain/eventView.ts` (`listEvents`, `matchArchive`, `eventDetail`)
- Modify: `packages/core/src/api.ts`
- Modify: `apps/worker/test/helpers.ts` (`apiRequest`: убрать `communityId`/заголовок)
- Test: `apps/worker/test/api/multipleGroups.test.ts` (переписать), все `test/api/*.test.ts`, использующие `communityId:` в `apiRequest`

**Interfaces:**
- Consumes: Task 2 `peerUserIds`, `nameTaken(db,name,userId)`, `usersById(db,ids)`; Task 3 `playerRatings(db,ids,now)`, `playerProfile(db,userId,viewerId,now)`.
- Produces (core, `packages/core/src/api.ts`):
  ```ts
  export interface MyCommunityDto { id: number; title: string; role: Role }
  // MeDto: удалить `role` и `community`; добавить
  communities: MyCommunityDto[];
  // EventSummaryDto: добавить
  community: CommunityDto;
  // EventDetailDto: добавить
  viewerRole: Role;
  // NotificationTaskDto: варианты review/payment/schedule получают `community: CommunityDto`
  export interface PlayersDto { groups: { community: CommunityDto; role: Role; players: PlayerSummaryDto[] }[] }
  ```
- Produces (worker):
  - `activeMemberships(db: Db, env: Pick<Env,'ADMIN_TG_ID'>, user: UserRow): Promise<{ community: CommunityRow; membership: MembershipRow; role: Role }[]>` — без запросов в Telegram, `memberships.active && communities.active`, сортировка по `title` (`localeCompare(…, 'ru')`).
  - `confirmedMemberships(db, tg, env, user, now)` — тот же результат, но каждое кандидатное членство (включая неактивные) проверяется `confirmedMembership`; вызывается только в `GET /me`.
  - `scopeCommunity(resolve: (c: Context<AppEnv>) => Promise<number | null>, denied: 403 | 404 = 404): MiddlewareHandler<AppEnv>` — находит группу, вызывает `confirmedMembership`, ставит `community`, `role`; не найдено или не участник → `denied`.
  - Маршруты (`routes.ts`): `scopeCommunity` вешается на `/events/:id`, `/events/:id/*`, `/bills/:id/*`, `/bill-lines/:id`, `/signups/:id` (резолвер по объекту, `404`) и на `/members`, `/members/:userId` (резолвер из `?communityId=`, `403`). Глобального `api.use('*', communityMiddleware())` нет. Проверить тестом, что `GET /api/events` (список) не попадает под `/events/:id`.
  - `POST /api/communities/:id/join` → `confirmedMembership`; `200 { community: CommunityDto }` или `403`. `GET /communities` и `GET /context` удалить.
  - `POST /api/events`: `communityId` **обязателен**; роль в этой группе `organizer|admin`, иначе `403`.
  - `GET /me` → `communities` из `confirmedMemberships`, `rating` из `playerRatings(db,[me],now)`.
  - `PATCH /me`: `nameTaken(db,name,me)`; изменение Kaspi ставит `sync.request(eventId,{parts:['bill']})` для открытых счетов, где он получатель, **во всех группах**.
  - `GET /me/skills`, `PUT /me/skills` — без группы.
  - `GET /events`, `GET /matches` — по `activeMemberships`; курсор архива общий (`date desc, id desc`).
  - `GET /notifications`: долги — по `bill_lines.user_id` (без фильтра членства); review — по участию; `skills` — если нет анкеты; `schedule` — сборы `collecting` групп, где роль `organizer|admin`.
  - `GET /players` → `PlayersDto`, группы из `activeMemberships`, внутри — активные участники, по имени.
  - `GET /players/:userId` → `playerProfile(db, userId, me, now)`, `null` → `404`.
  - Отметка оплаты строки счёта (`POST /bill-lines/:id`, `POST /bills/:id/paid`) своим долгом **после выхода из группы**: резолвер находит группу, `confirmedMembership` вернёт `null` → сейчас был бы `404`. Для этих двух маршрутов, если строка принадлежит `user.id`, пропускать без членства с ролью `player`.

- [ ] **Step 1: Тесты** в `test/api/multipleGroups.test.ts` (мир: A — admin, org, player; B — player и `orgB`, где player — игрок):
  - `user without groups can open the app` — новый `tgId` без членств: `GET /api/me` → `200`, `communities: []`; `GET /api/events` → `{active:[],past:[]}`.
  - `feed merges groups and labels them` — по матчу в A и B → `GET /api/events` как player содержит оба, у каждого `community.title`.
  - `create requires organizer role in the chosen group` — org: `POST /api/events {communityId:A}` → `200`; `{communityId:B}` → `403`; без `communityId` → `400`.
  - `foreign event stays hidden` — матч B, запрос `/api/events/:id` от admin (не в B) → `404`; `/join` → `404`.
  - `members management is scoped by query` — admin: `PATCH /api/members/:player?communityId=A {role:'organizer'}` → `200`; `?communityId=B` → `403`.
  - `join hint creates membership` — новый игрок есть в Telegram-чате B, нет в `memberships`: `POST /api/communities/B/join` → `200`; потом `GET /api/me` содержит B. Не в чате → `403`.
  - `debt survives leaving the group` — счёт в B со строкой player, затем player убран из чата B (`tg.chatMembers`) и `memberships.active=false`: `GET /api/notifications` содержит `payment`; `POST /api/bill-lines/:id {paid:true}` → `200`.
  - `players grouped by community` — `GET /api/players` как player → две группы, отсортированы по названию, у player одинаковый `rating.value` в обеих.
  - `kaspi change resyncs open bills in every group` — player получатель открытых счетов в A и B, `PATCH /api/me {kaspiPhone}` → `w.sync` получил запросы `['bill']` по обоим событиям.
- [ ] **Step 2:** запустить → FAIL.
- [ ] **Step 3:** Реализация по Interfaces. В существующих тестах убрать `communityId` из `apiRequest`, ожидания `me.role` заменить на `me.communities[0].role`, `me.community` — на `me.communities`.
- [ ] **Step 4:** `pnpm --filter @altynka/worker test` и `pnpm --filter @altynka/worker typecheck` → зелёные.
- [ ] **Step 5:** Коммит — `feat(api): person-scoped feed, object-scoped permissions`.

### Task 5: Бот в личке

**Files:**
- Modify: `apps/worker/src/bot/private.ts`, `apps/worker/src/bot/presentation.ts` (`settingsKeyboard`)
- Test: `apps/worker/test/bot/private.test.ts`, `apps/worker/test/bot/multipleGroups.test.ts`

**Interfaces:**
- Consumes: Task 4 `activeMemberships`, `confirmedMembership`.
- Produces: `settingsKeyboard(env, enabled)` — без `communityId`; callback `notify:0|1` (регексп продолжает принимать старый `notify:<id>:0|1` и игнорирует id).

- [ ] **Step 1: Тесты:**
  - `/matches` у участника A и B — одно сообщение, матчи обеих групп, у каждой строки название группы; у участника одной группы названий нет.
  - `/payments` — долги из всех групп, включая группу, из которой человек вышел.
  - `/settings` — без выбора команды; нажатие `notify:1` ставит `users.notifications_enabled = 1`.
  - `/newmatch`: организатор хотя бы где-то → кнопка приложения `newmatch`; нигде → текст с объяснением и кнопкой «Добавить в группу».
  - `/start c<B>_matches` от человека из чата B без членства → членство создано, ответ без выбора команды.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализация; `select()` с выбором команды и callback `team:` удалить. Ссылки в личке — без префикса `c{id}_`. Групповые команды (`group.command`) не трогать.
- [ ] **Step 4:** `pnpm --filter @altynka/worker test` → PASS.
- [ ] **Step 5:** Коммит — `feat(bot): private commands across all groups`.

### Task 6: Мини-апп — вход без команды и создание матча

**Files:**
- Delete: `apps/miniapp/src/screens/CommunityGate.tsx`, `apps/miniapp/src/state/community.ts`, `apps/miniapp/test/CommunityGate.test.tsx`, `apps/miniapp/test/community.test.ts`
- Modify: `apps/miniapp/src/App.tsx`, `src/lib/api.ts`, `src/lib/queryClient.ts`, `src/hooks/useResource.ts`, `src/lib/startParam.ts`, `src/state/me.tsx`, `src/components/Nav.tsx`, `src/screens/NewEvent.tsx`, `src/styles/app.css` (удалить `.community-bar`, `.community-switch*`, `.community-choice`)
- Test: `apps/miniapp/test/NewEvent.test.tsx` (создать), `test/startParam.test.ts`, `test/useResource.test.ts`, `test/setup.ts`, `test/render.tsx`

**Interfaces:**
- Consumes: Task 4 `MeDto.communities`, `POST /api/communities/:id/join`.
- Produces (`src/state/me.tsx`):
  ```ts
  export const creatableCommunities = (me: MeDto) => me.communities.filter(c => c.role !== 'player');
  export const showGroups = (me: MeDto) => me.communities.length > 1;
  ```
  `canManage(me)` удалить (для матчей — Task 7 `canManageEvent`).
  `resourceKey(path)` → `['api', path]`; `api.get(path, { signal })` без `communityId`.
  `contextForStartParam(p)` → `{ joinCommunityId?: number; route: string }`.

- [ ] **Step 1: Тесты** `NewEvent.test.tsx`:
  - одна группа с правом создания → поля «Группа» нет; отправка шлёт `{ date, communityId: <id> }`.
  - две → `radiogroup` «Группа» с двумя `radio` по названию, ни один не отмечен, кнопка «Открыть запись» `disabled`; после выбора — активна, тело запроса с выбранным `communityId`.
  - ноль групп вообще → текст «Добавь бота в Telegram-группу…» и кнопка «Добавить в группу» (`https://t.me/<BOT_USERNAME>?startgroup=connect&admin=pin_messages`), формы нет.
  - группы есть, но везде игрок → текст «Создавать матчи может организатор группы. Попроси администратора группы назначить тебя организатором.» и та же подсказка про подключение своей группы.
  `startParam.test.ts`: `contextForStartParam('c7_matches')` → `{ joinCommunityId: 7, route: '/matches' }`.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализация:
  - `App` рендерит приложение сразу; при `joinCommunityId` один раз шлёт `POST /api/communities/:id/join` (ошибку игнорирует), затем `queryClient.invalidateQueries({queryKey:['api']})`.
  - `Nav`: кнопка «Создать матч» есть у всех (`/new` всегда открывает лист).
  - `App`: оверлей `/new` открывается для всех; убрать `canManage` из `overlayBackground`.
  - `NewEvent`: группы — `creatableCommunities(me)`; список `role="radiogroup"` со строками-`label` с `input type="radio"` (стиль — по макету 2Б: строка 48px+, рамка `--line`, выбранная — рамка `--accent` и фон `--accent-soft`).
  - Имя бота для ссылки — из того же источника, что использует `miniAppLink`/`tg.ts` (если на клиенте его нет — добавить `VITE_BOT_USERNAME` в `vite` env с дефолтом `fc_altynka_bot`).
- [ ] **Step 4:** Экраны, ещё использующие `canManage`/`me.role`/`me.community`, временно переводятся на `creatableCommunities(me).length > 0` (точные права на матч делает Task 7). `pnpm --filter @altynka/miniapp test` и `pnpm --filter @altynka/miniapp typecheck` → зелёные.
- [ ] **Step 5:** Коммит — `feat(miniapp): open without a team, pick group only when creating`.

### Task 7: Мини-апп — общая лента, права в матче, игроки, профиль

**Files:**
- Create: `apps/miniapp/src/components/GroupTag.tsx`
- Modify: `src/components/MatchCard.tsx` (`MatchCard`, `MatchRow`), `src/components/TaskCard.tsx`, `src/components/PlayerRating.tsx` (`RatingHistory`), `src/screens/{Home,Matches,Notifications,Event,MatchParticipation,EventList,Teams,Bill,Schedule,Players,Profile,SkillAssessment}.tsx`, `src/state/me.tsx`, `src/styles/app.css`
- Test: `apps/miniapp/test/EventList.test.tsx`, `Home.test.tsx`, `Players.test.tsx`, `Profile.test.tsx`, `MatchPage.test.tsx`, `Teams.test.tsx`, `Bill.test.tsx`, `Schedule.test.tsx`

**Interfaces:**
- Consumes: Task 4 DTO; Task 6 `showGroups`, `creatableCommunities`.
- Produces:
  - `canManageEvent(ev: EventDetailDto) => ev.viewerRole !== 'player'` в `src/state/me.tsx`; все проверки прав внутри матча (Event, MatchParticipation, EventList, Teams, Bill, Schedule, оверлей расписания в `App`) используют её.
  - `<GroupTag community={CommunityDto} />` — тег с точкой; цвет точки `GROUP_COLORS[community.id % GROUP_COLORS.length]`, палитра из 5 светлых тонов, проходящих контраст на plum/blue/graphite (подобрать в `app.css` как CSS-переменные `--group-1..5`). Рендерится только при `showGroups(me)`.

- [ ] **Step 1: Тесты:**
  - `Home/Matches`: при двух группах у карточек есть тег с названием группы; при одной — тега нет.
  - `Home`, ноль групп → пустое состояние с инструкцией подключения бота (тот же текст, что в Task 6).
  - `Event`: `viewerRole: 'player'` при `me.communities` с ролью organizer в другой группе → кнопок организатора нет; `viewerRole: 'organizer'` → есть.
  - `Players`: `PlayersDto` с двумя группами → два заголовка-раздела по названию; при одной — без заголовка; блок управления ролями только в разделе с `role: 'admin'` (запрос `/api/members?communityId=<id>`).
  - `Profile`: при двух группах строка роли без названия группы; история матчей с тегами групп.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Реализация. `SkillAssessment` ключ подсказки — `altynka:skills-prompt:${me.userId}`. Заголовок экрана игроков — «Игроки».
- [ ] **Step 4:** `pnpm --filter @altynka/miniapp test`, `pnpm typecheck` → зелёные.
- [ ] **Step 5:** Коммит — `feat(miniapp): merged feed with group tags and per-match roles`.

### Task 8: Браузерные сценарии и документация

**Files:**
- Modify: `tests/ui/communities.spec.ts` (переписать), `tests/ui/team-fixture.ts`, остальные `tests/ui/*.spec.ts`, где мок отдаёт `role`/`community` или шлёт `X-Community-Id`
- Modify: `DESIGN.md` (раздел «Navigation and screens», лист создания), `README.md` (если описывает выбор команды)
- Modify: `docs/superpowers/specs/2026-11-06-multiple-groups-design.md` — строка статуса: «Разделы о профилях, текущей команде и интерфейсе заменены `2026-11-06-unified-groups-design.md`».

- [ ] **Step 1:** `communities.spec.ts` — три сценария: без групп (профиль открывается, лента пустая с инструкцией); одна группа (нет текста «Сменить», нет поля «Группа», нет тегов); две группы (теги на карточках, в «Новом матче» список из двух строк, кнопка неактивна до выбора).
- [ ] **Step 2:** `pnpm test:ui` → после правок фикстур всё зелёное (включая axe-проверки).
- [ ] **Step 3:** Обновить документы.
- [ ] **Step 4:** Полный прогон: `pnpm test && pnpm typecheck && pnpm test:migrations && pnpm test:ui`.
- [ ] **Step 5:** Коммит — `test(ui): multi-group flows; docs`.
