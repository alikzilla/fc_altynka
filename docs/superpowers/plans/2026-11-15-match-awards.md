# Match Awards (MVP и лучшие по позициям) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В опросе после матча игроки выбирают MVP и лучших по четырём позициям; после закрытия голосования победители видны в матче, ленте, статистике и достижениях.

**Architecture:** Выбор наград едет в том же `ReviewInput`, что и оценки; триггер раскладывает его в новую таблицу `award_votes`. Победителей нигде не хранят: одна чистая функция `awardWinners` в `packages/core` считает их при чтении, и её вызывают матч, лента, профиль и таблица лидеров.

**Tech Stack:** TypeScript, pnpm monorepo, Cloudflare Worker + Hono + zod, D1 + Drizzle, React 19 + TanStack Query, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-match-awards-design.md`

## Global Constraints

- Весь пользовательский текст и документация на русском. В интерфейсе «матч», не «встреча».
- Пять наград, ключи и порядок: `mvp`, `forward`, `midfielder`, `defender`, `goalkeeper`.
- Победитель: больше всех голосов; при равенстве выше средняя оценка за этот матч (по всем оценкам, даже если их меньше трёх; игрок без оценок проигрывает); при полном равенстве награду получают все равные. Награда присуждается при `MIN_AWARD_VOTES = 2` голосах у лидера.
- Итоги наград не отдаются API, пока `now < closesAt`. Полная раскладка голосов и авторы не отдаются никогда; число голосов только у победителя.
- За себя голосовать нельзя; получатель обязан быть участником матча с `userId` (гости не участвуют).
- Награды не влияют на рейтинг.
- Отменённые матчи не считаются.
- Запрос D1 принимает не больше 100 параметров: списки id резать по 50.
- Импорты относительные, без алиасов. Логика, нужная и Worker, и мини-аппу, живёт в `packages/core`.
- UI по `DESIGN.md`: прочитать его перед задачами 7 и 8.
- Миграция применяется к удалённой D1 до выката Worker. В продакшене синтетических данных не создавать.
- Работать в отдельной ветке, не в `main`.

## Review Focus

1. **Мини-апп старой версии в кэше Telegram шлёт ответ без `awards`.** Ответ принимается, наград нет. Тест в задаче 3.
2. **Повтор отправки после обрыва сети с теми же наградами.** Должен вернуть `ok`, а не `conflict`, при любом порядке ключей в `awards`. Тест в задаче 3.
3. **Матч, где кроме голосующего нет ни одного участника с аккаунтом (остальные гости).** Шагов наград нет вовсе, опрос не ломается. Тест в задаче 7.
4. **Матч, закрытый до выпуска, или матч, где ни одна награда не набрала голосов.** Блок «Награды матча» не показывается; пять строк «Недостаточно голосов» подряд не выводятся. Тест в задаче 7.
5. **Три и более победителей одной награды, либо два MVP.** Пост в ленте и строка в матче перечисляют всех («А, Б и В»), пост не подписан одним игроком. Тесты в задачах 6 и 7.

---

### Task 1: Общая логика наград в `packages/core`

**Files:**
- Create: `packages/core/src/awards.ts`
- Modify: `packages/core/src/index.ts` (добавить `export * from './awards';`)
- Modify: `packages/core/src/ratings.ts` (`ReviewInput`, `MatchReviewDto`)
- Test: `packages/core/test/awards.test.ts`

**Interfaces:**
- Produces:

```ts
export const AWARDS = ['mvp', 'forward', 'midfielder', 'defender', 'goalkeeper'] as const;
export type AwardKey = typeof AWARDS[number];
export const MIN_AWARD_VOTES = 2;
export const AWARD_LABEL: Record<AwardKey, string>;      // заголовок шага
export const AWARD_SHORT_LABEL: Record<AwardKey, string>; // строка итогов
export const AWARD_QUESTION: Record<AwardKey, string>;
export type AwardPicks = Partial<Record<AwardKey, number>>;
export interface AwardTally { award: AwardKey; userId: number; votes: number }
export type AwardResult = { winners: number[]; votes: number } | null;
export type MatchAwardResults = Record<AwardKey, AwardResult>;
export function awardWinners(tallies: readonly AwardTally[], averages: ReadonlyMap<number, number>): MatchAwardResults;
/** Ключи в порядке AWARDS; undefined, если ничего не выбрано. */
export function normalizeAwardPicks(picks: AwardPicks | undefined): AwardPicks | undefined;
export const emptyAwardCounts = (): Record<AwardKey, number>;
export type MatchAwardsDto = Record<AwardKey, { winners: { userId: number; name: string; photoUrl?: string | null }[]; votes: number } | null>;
```

- В `ratings.ts`: `ReviewInput.awards?: AwardPicks`; `MatchReviewDto.awards: MatchAwardsDto | null` (не `null` только в состоянии `closed`).

Тексты (фиксированы):

| ключ | `AWARD_LABEL` | `AWARD_SHORT_LABEL` | `AWARD_QUESTION` |
| --- | --- | --- | --- |
| mvp | MVP матча | MVP матча | Кто был лучшим игроком матча? |
| forward | Лучший нападающий | Нападающий | Кто опаснее всех играл в атаке? |
| midfielder | Лучший полузащитник | Полузащитник | Кто лучше всех вёл игру в центре? |
| defender | Лучший защитник | Защитник | Кто лучше всех сыграл в обороне? |
| goalkeeper | Лучший вратарь | Вратарь | Кто лучше всех сыграл в воротах? |

- [ ] **Step 1: Написать падающие тесты** в `packages/core/test/awards.test.ts`

```ts
const avg = (rows: [number, number][]) => new Map(rows);
it('gives the award to the player with most votes', () => {
  expect(awardWinners([{ award: 'mvp', userId: 1, votes: 4 }, { award: 'mvp', userId: 2, votes: 2 }], avg([])).mvp)
    .toEqual({ winners: [1], votes: 4 });
});
it('breaks a tie by the higher match average', () => {
  const r = awardWinners([{ award: 'defender', userId: 1, votes: 3 }, { award: 'defender', userId: 2, votes: 3 }], avg([[1, 7.5], [2, 8]]));
  expect(r.defender).toEqual({ winners: [2], votes: 3 });
});
it('shares the award when votes and averages are equal, winners sorted by id', () => {
  const r = awardWinners([{ award: 'forward', userId: 5, votes: 3 }, { award: 'forward', userId: 2, votes: 3 }], avg([[5, 8], [2, 8]]));
  expect(r.forward).toEqual({ winners: [2, 5], votes: 3 });
});
it('a player without ratings loses the tie to a rated one', () => {
  const r = awardWinners([{ award: 'mvp', userId: 1, votes: 2 }, { award: 'mvp', userId: 2, votes: 2 }], avg([[2, 4]]));
  expect(r.mvp).toEqual({ winners: [2], votes: 2 });
});
it('two unrated players on equal votes share', () => {
  expect(awardWinners([{ award: 'mvp', userId: 1, votes: 2 }, { award: 'mvp', userId: 2, votes: 2 }], avg([])).mvp?.winners).toEqual([1, 2]);
});
it('gives nothing below two votes and returns every key', () => {
  const r = awardWinners([{ award: 'goalkeeper', userId: 1, votes: 1 }], avg([]));
  expect(r).toEqual({ mvp: null, forward: null, midfielder: null, defender: null, goalkeeper: null });
});
it('normalizes picks to AWARDS order and drops an empty object', () => {
  expect(JSON.stringify(normalizeAwardPicks({ goalkeeper: 3, mvp: 2 }))).toBe('{"mvp":2,"goalkeeper":3}');
  expect(normalizeAwardPicks({})).toBeUndefined();
  expect(normalizeAwardPicks(undefined)).toBeUndefined();
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `pnpm --filter @altynka/core exec vitest run test/awards.test.ts`
Expected: FAIL, модуль `awards` не найден.

- [ ] **Step 3: Реализовать `awards.ts`, экспорт в `index.ts`, поля в `ratings.ts`**

Средние сравнивать с допуском `1e-9`.

- [ ] **Step 4: Тесты и типы**

Run: `pnpm --filter @altynka/core exec vitest run test/awards.test.ts && pnpm typecheck`
Expected: PASS. `typecheck` упадёт в Worker на `matchReview` (нет поля `awards`): добавить там `awards: null` во все возвращаемые объекты, чтобы сборка осталась зелёной; настоящая логика в задаче 3.

- [ ] **Step 5: Commit** `feat(core): award keys, picks and winner rule`

---

### Task 2: Таблица `award_votes` и триггер

**Files:**
- Create: `apps/worker/migrations/0018_match_awards.sql`
- Modify: `apps/worker/migrations/meta/_journal.json` (запись `idx: 18`, `tag: "0018_match_awards"`, `when` больше `1794510000000`)
- Modify: `apps/worker/src/db/schema.ts` (таблица `awardVotes` рядом с `playerVotes`)
- Modify: `apps/worker/test/setup.ts` (`'award_votes'` в начало `TABLES`, перед `'player_votes'`)
- Test: `apps/worker/test/domain/awards.test.ts`

**Interfaces:**
- Produces: таблица

```sql
CREATE TABLE award_votes (
  event_id integer NOT NULL, author_id integer NOT NULL, award text NOT NULL, recipient_id integer NOT NULL,
  PRIMARY KEY (event_id, author_id, award),
  FOREIGN KEY (event_id, author_id) REFERENCES review_submissions(event_id, user_id),
  FOREIGN KEY (event_id, recipient_id) REFERENCES match_participants(event_id, user_id),
  CHECK (award IN ('mvp','forward','midfielder','defender','goalkeeper')),
  CHECK (author_id <> recipient_id)
);
CREATE INDEX award_votes_recipient ON award_votes(recipient_id, event_id);
```

и триггер `review_submission_awards AFTER INSERT ON review_submissions`, который вставляет строку на каждую пару из `json_each(NEW.payload_json, '$.awards')` (`key` → `award`, `value` → `recipient_id`). Между операторами в файле миграции ставить `--> statement-breakpoint`, как в `0008_player_ratings.sql`.

- Drizzle: `export const awardVotes` с полями `eventId`, `authorId`, `award` (`$type<AwardKey>()`), `recipientId`.

- [ ] **Step 1: Падающий тест** в `apps/worker/test/domain/awards.test.ts`. Подготовку матча с опросом взять из `apps/worker/test/domain/ratings.test.ts` (те же помощники).

```ts
it('a submission with awards writes one award_votes row per pick', async () => {
  // матч завершён, участники 1, 2, 3; автор 1
  await insertSubmission(1, { scores: [{ userId: 2, score: 8 }], gameScore: null, skipped: false, awards: { mvp: 2, defender: 3 } });
  const rows = await env.DB.prepare('SELECT award, recipient_id AS r FROM award_votes WHERE author_id = 1 ORDER BY award').all();
  expect(rows.results).toEqual([{ award: 'defender', r: 3 }, { award: 'mvp', r: 2 }]);
});
it('a submission without awards writes no award_votes rows', async () => { /* payload без поля awards → count(*) = 0 */ });
it('the database rejects a self vote and an unknown award', async () => {
  await expect(insertSubmission(1, { ..., awards: { mvp: 1 } })).rejects.toThrow();
  await expect(insertSubmission(1, { ..., awards: { captain: 2 } })).rejects.toThrow();
});
```

`insertSubmission` — локальный помощник теста: прямой `INSERT INTO review_submissions` с `payload_json`.

- [ ] **Step 2:** Run: `pnpm --filter @altynka/worker exec vitest run test/domain/awards.test.ts` → FAIL, `no such table: award_votes`.
- [ ] **Step 3:** Написать миграцию, запись в журнале, схему, строку в `TABLES`.
- [ ] **Step 4:** Run: тот же файл и `pnpm test:migrations` → PASS.
- [ ] **Step 5: Commit** `feat(worker): award_votes table filled from the review submission`

---

### Task 3: Приём выбора и итоги в опросе

**Files:**
- Create: `apps/worker/src/domain/awards.ts`
- Modify: `apps/worker/src/domain/ratings.ts` (`submitReview`, `matchReview`)
- Modify: `apps/worker/src/api/ratings.ts:17` (`reviewBody`)
- Test: `apps/worker/test/domain/awards.test.ts`, `apps/worker/test/api/ratings.test.ts`

**Interfaces:**
- Consumes: `awardWinners`, `normalizeAwardPicks`, `AWARDS`, `MatchAwardResults`, `MatchAwardsDto` (задача 1); таблица `award_votes` (задача 2).
- Produces в `domain/awards.ts`:

```ts
/** Итоги по матчам; вызывающий сам отвечает за то, что голосование закрыто. */
export async function awardsByEvent(db: Db, eventIds: number[]): Promise<Map<number, MatchAwardResults>>;
```

Читает счёт голосов из `award_votes` и средние из `player_votes` (без порога в три голоса) по этим матчам, id режет по 50, на каждый матч вызывает `awardWinners`. Матч без голосов в карту не попадает.

- `reviewBody`: добавить `awards: z.object({ mvp, forward, midfielder, defender, goalkeeper }: каждое z.number().int().positive().optional()).strict().optional()`.
- `submitReview`: получатель каждой награды должен быть в множестве участников и не равен `userId`, иначе `'invalid'`. В нормализованный объект поле `awards` попадает только через `normalizeAwardPicks` и только если оно не `undefined`: ответ без наград сериализуется той же строкой, что до выпуска.
- `matchReview`: при `now >= review.closesAt` поле `awards` — `MatchAwardsDto` из `awardsByEvent` с именами из `match_participants` и фото из `usersById`; во всех остальных состояниях `null`. Если в матче ни у одной награды нет результата, тоже `null`.

- [ ] **Step 1: Падающие тесты**

В `test/domain/awards.test.ts`:

```ts
it('accepts picks, rejects a self pick and a non-participant', async () => {
  expect(await submitReview(deps, ev, 1, { ...base, awards: { mvp: 2 } })).toBe('ok');
  expect(await submitReview(deps, ev, 2, { ...base2, awards: { mvp: 2 } })).toBe('invalid');
  expect(await submitReview(deps, ev, 3, { ...base3, awards: { forward: 999 } })).toBe('invalid');
});
it('a retry with the same picks in another key order is ok, different picks conflict', async () => {
  await submitReview(deps, ev, 1, { ...base, awards: { mvp: 2, goalkeeper: 3 } });
  expect(await submitReview(deps, ev, 1, { ...base, awards: { goalkeeper: 3, mvp: 2 } })).toBe('ok');
  expect(await submitReview(deps, ev, 1, { ...base, awards: { mvp: 3 } })).toBe('conflict');
});
it('a submission without awards stores the pre-release payload string', async () => {
  await submitReview(deps, ev, 1, base);
  const [row] = await db.select().from(reviewSubmissions);
  expect(row.payloadJson).toBe(JSON.stringify({ scores: base.scores, gameScore: base.gameScore, skipped: false }));
});
it('hides awards while voting is open and shows winners with names after it closes', async () => {
  // 1 и 3 голосуют за 2 как mvp; 1 голосует за 3 как defender (один голос)
  expect((await matchReview(db, ev, 1, false, now)).awards).toBeNull();
  const closed = await matchReview(db, ev, 1, false, closesAt);
  expect(closed.awards?.mvp).toEqual({ winners: [{ userId: 2, name: 'Второй', photoUrl: null }], votes: 2 });
  expect(closed.awards?.defender).toBeNull();
});
it('awards is null after close when nobody picked anything', async () => { /* только оценки */ });
```

В `test/api/ratings.test.ts`:

```ts
it('POST /review without the awards field still succeeds (old mini app)', async () => { /* 200 */ });
it('POST /review rejects an unknown award key with 400', async () => { /* awards: { captain: 2 } */ });
```

- [ ] **Step 2:** Run: `pnpm --filter @altynka/worker exec vitest run test/domain/awards.test.ts test/api/ratings.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать `awardsByEvent`, правки `submitReview`, `matchReview`, `reviewBody`.
- [ ] **Step 4:** Run: те же файлы плюс `test/domain/ratings.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(worker): accept award picks and publish winners at close`

---

### Task 4: Награды в статистике игрока и достижения

**Files:**
- Modify: `packages/core/src/playerStatistics.ts` (`PlayerStatistics`, `aggregatePlayerStatistics`)
- Modify: `packages/core/src/achievements.ts` (`ACHIEVEMENT_IDS`, `AchievementSymbol`, `LADDERS`)
- Modify: `apps/worker/src/domain/awards.ts`, `apps/worker/src/domain/playerStatistics.ts`
- Modify: `apps/worker/src/db/schema.ts:23` (enum `pinnedAchievement` = `ACHIEVEMENT_IDS`)
- Test: `packages/core/test/achievements.test.ts`, `apps/worker/test/domain/awards.test.ts`, `apps/worker/test/domain/playerStatistics.test.ts`

**Interfaces:**
- Consumes: `awardsByEvent` (задача 3), `emptyAwardCounts` (задача 1).
- Produces:
  - `PlayerStatistics` получает `awards: Record<AwardKey, number>`, `mvps: number` (= `awards.mvp`), `positionAwards: number` (сумма четырёх остальных).
  - `aggregatePlayerStatistics(history, awards = emptyAwardCounts())` заполняет эти три поля; существующие вызовы без второго аргумента дают нули.
  - `ACHIEVEMENT_IDS` дополняется `'mvp'`, `'position-best'`; `AchievementSymbol` — `'star'`, `'medal'`.
  - Лестницы:
    - `{ id: 'mvp', title: 'MVP', metric: 'Награды «MVP матча»', unit: ['награда', 'награды', 'наград'], symbol: 'star', stat: 'mvps', thresholds: [1, 3, 5, 10, 20, 35, 50] }`
    - `{ id: 'position-best', title: 'Лучший на позиции', metric: 'Награды лучшему нападающему, полузащитнику, защитнику и вратарю', unit: ['награда', 'награды', 'наград'], symbol: 'medal', stat: 'positionAwards', thresholds: [1, 5, 10, 25, 50, 75, 100] }`
  - В `domain/awards.ts`:

```ts
/** Сколько наград у игрока в закрытых, не отменённых матчах, видимых смотрящему (как в playerGameStatistics). */
export async function playerAwardCounts(db: Db, userId: number, viewerId: number, now: number): Promise<Record<AwardKey, number>>;
```

  Берёт матчи, где игрок получил хотя бы один голос за награду, `closes_at <= now`, `status <> 'cancelled'`, с тем же условием общих групп, что `scope` в `playerGameStatistics`; затем `awardsByEvent` и счёт. Старый протокол (`protocol_version = 0`) учитывается.
  - `playerGameStatistics` передаёт результат вторым аргументом в `aggregatePlayerStatistics`.

- [ ] **Step 1: Падающие тесты**

`packages/core/test/achievements.test.ts`:

```ts
it('mvp and position ladders follow their thresholds', () => {
  const rows = playerAchievements({ ...zeroStats, mvps: 3, positionAwards: 4, awards: { mvp: 3, forward: 4, midfielder: 0, defender: 0, goalkeeper: 0 } });
  expect(rows.find(r => r.id === 'mvp')).toMatchObject({ level: 2, tier: 'bronze', nextTarget: 5 });
  expect(rows.find(r => r.id === 'position-best')).toMatchObject({ level: 1, tier: 'wood', nextTarget: 5 });
});
it('there are seven ladders', () => expect(ACHIEVEMENT_TOTAL_LEVELS).toBe(49));
```

`apps/worker/test/domain/awards.test.ts`:

```ts
it('counts a player\'s awards across closed matches, including a shared one', async () => {
  // матч A: игрок 2 — mvp (2 голоса) и defender на двоих с игроком 3; матч B: игрок 2 — mvp
  expect(await playerAwardCounts(db, 2, 2, afterClose)).toEqual({ mvp: 2, forward: 0, midfielder: 0, defender: 1, goalkeeper: 0 });
});
it('ignores matches still open, cancelled matches and groups the viewer does not share', async () => { /* три случая → нули */ });
it('counts awards from a legacy match without game statistics', async () => { /* protocol_version 0 */ });
```

`apps/worker/test/domain/playerStatistics.test.ts`:

```ts
it('profile statistics carry award totals', async () => {
  expect((await playerGameStatistics(db, 2, 2, afterClose)).statistics).toMatchObject({ mvps: 2, positionAwards: 1 });
});
```

- [ ] **Step 2:** Run: `pnpm --filter @altynka/core exec vitest run test/achievements.test.ts && pnpm --filter @altynka/worker exec vitest run test/domain/awards.test.ts test/domain/playerStatistics.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать. Проверить, что закрепление достижения (`pinnedAchievement`, `isAchievementId`) принимает оба новых id.
- [ ] **Step 4:** Run: `pnpm test && pnpm typecheck` → PASS. Мини-апп может упасть на `Record<AchievementSymbol, …>`: добавить в `Icon.tsx` значки `star` и `medal` (обводка и размер как у соседних значков) сейчас, оформление — в задаче 8.
- [ ] **Step 5: Commit** `feat: award totals in player statistics and two achievement ladders`

---

### Task 5: MVP в таблице лидеров

**Files:**
- Modify: `packages/core/src/playerStatistics.ts` (`LeaderboardRowDto`, `LEADERBOARD_BOARDS`, `mergeLeaderboard`)
- Modify: `apps/worker/src/domain/awards.ts`, `apps/worker/src/domain/leaderboard.ts`
- Test: `packages/core/test/leaderboard.test.ts`, `apps/worker/test/domain/leaderboard.test.ts`

**Interfaces:**
- Consumes: `awardsByEvent`.
- Produces:
  - `LeaderboardRowDto.mvps: number`; `LEADERBOARD_BOARDS` дополняется `'mvps'` в конце; `mergeLeaderboard` складывает `mvps` по группам; `leaderboardValue(row, 'mvps')` возвращает `row.mvps`.
  - `export async function communityMvpCounts(db: Db, communityIds: number[], now: number): Promise<Map<string, number>>` — ключ `` `${communityId}:${userId}` ``, только закрытые и не отменённые матчи этих групп.
  - `leaderboard()` заполняет `mvps` из этой карты (нет ключа — `0`).

- [ ] **Step 1: Падающие тесты**

```ts
// core
it('ranks by mvps and sums them across groups', () => {
  const merged = mergeLeaderboard([group(1, [row(7, { mvps: 2 })]), group(2, [row(7, { mvps: 1 }), row(8, { mvps: 2 })])], null);
  expect(rankLeaderboard(merged, 'mvps').map(r => [r.userId, r.mvps])).toEqual([[7, 3], [8, 2]]);
});
// worker
it('leaderboard rows carry the MVP count of that group only', async () => {
  // игрок 2: MVP в матче группы 1 и в матче группы 2
  const board = await leaderboard(db, [{ id: 1, title: 'A' }, { id: 2, title: 'B' }], afterClose);
  expect(board.groups[0].players.find(p => p.userId === 2)?.mvps).toBe(1);
});
```

- [ ] **Step 2:** Run оба файла → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** Run: `pnpm test && pnpm typecheck` → PASS (в мини-аппе `BOARDS` в `Statistics.tsx` дополнить парой `['mvps', 'MVP']`, чтобы типы сошлись).
- [ ] **Step 5: Commit** `feat: MVP board in the leaderboard`

---

### Task 6: Пост о наградах в ленте

**Files:**
- Modify: `packages/core/src/feed.ts` (`FEED_KINDS`, новая `composeAwardsPost`)
- Modify: `apps/worker/src/domain/feed.ts` (`publishClosedVotes`)
- Modify: `apps/miniapp/src/components/NewsFeed.tsx:18-33` (значок `star`, подпись «Награды матча», ссылка `/event/:id` для вида `awards`)
- Test: `packages/core/test/feed.test.ts`, `apps/worker/test/domain/feed.test.ts`

**Interfaces:**
- Consumes: `awardsByEvent`, `AWARDS`, `AwardKey`.
- Produces:

```ts
// FEED_KINDS: [...FEED_MATCH_KINDS, 'top_rated', 'awards', ...FEED_UPCOMING_KINDS]
export function composeAwardsPost(v: {
  eventId: number; date: string;
  /** Имена победителей по наградам; пустой массив — награда не присуждена. */
  winners: Record<AwardKey, { userId: number; name: string }[]>;
  recent?: RecentVariants;
}): FeedDraft | null;
```

Правила текста: `null`, если не присуждена ни одна награда. `kind: 'awards'`, `slot: 'awards'`. Пост называет дату (`formatDayMonthRu`) и каждую присуждённую награду с именами; несколько имён — «А и Б», «А, Б и В». Неприсуждённые награды не упоминаются. `userId` поста — единственный MVP, иначе `null`. `highlights` — все названные имена. Не меньше трёх формулировок через `Voice`, по правилам формулировок из README (раздел о ленте). Пост, где есть только MVP, должен читаться естественно.

`publishClosedVotes`:
- Для матчей, закрытых в окне `VOTES_WINDOW_MS`, без поста `awards`: посчитать `awardsByEvent`, написать пост с `createdAt = closesAt` (как `top_rated`).
- Пост `top_rated` не создаётся, если у матча присуждён MVP. Условие выборки `top_rated` дополнить: не брать матчи, у которых уже есть пост `awards` с присуждённым MVP, иначе запрос будет повторяться на каждое чтение ленты. Проще всего сначала обработать награды, а затем исключать такие матчи по id.
- Пост `top_rated`, уже написанный до выпуска, остаётся.

- [ ] **Step 1: Падающие тесты**

```ts
// core
it('names every awarded prize and signs the post with a single MVP', () => {
  const post = composeAwardsPost({ eventId: 1, date: '2026-11-14', winners: { mvp: [A], forward: [B], midfielder: [], defender: [C, D], goalkeeper: [] } })!;
  expect(post).toMatchObject({ kind: 'awards', slot: 'awards', userId: A.userId });
  for (const name of ['Алихан', 'Дамир', 'Ерлан и Санжар']) expect(post.text).toContain(name);
  expect(post.text).not.toMatch(/вратар|полузащитник/i);
  expect(post.highlights).toEqual(expect.arrayContaining(['Алихан', 'Дамир', 'Ерлан', 'Санжар']));
});
it('lists three sharing winners and leaves the post unsigned for two MVPs', () => {
  const post = composeAwardsPost({ eventId: 1, date: '2026-11-14', winners: { ...none, mvp: [A, B], defender: [C, D, E] } })!;
  expect(post.userId).toBeNull();
  expect(post.text).toContain('Ерлан, Санжар и Тимур');
});
it('returns null when nothing was awarded', () => expect(composeAwardsPost({ eventId: 1, date: '2026-11-14', winners: none })).toBeNull());
// worker
it('writes one awards post after close and no top_rated when an MVP exists', async () => {
  await publishClosedVotes(deps(afterClose), [communityId]); await publishClosedVotes(deps(afterClose), [communityId]);
  expect(await kinds(eventId)).toEqual(['awards']);
});
it('still writes top_rated when no MVP was awarded', async () => { /* только оценки, ≥3 голоса */ expect(await kinds(eventId)).toEqual(['top_rated']); });
it('writes nothing while voting is open', async () => { /* now < closesAt → [] */ });
```

- [ ] **Step 2:** Run: `pnpm --filter @altynka/core exec vitest run test/feed.test.ts && pnpm --filter @altynka/worker exec vitest run test/domain/feed.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать, включая три строки в `NewsFeed.tsx`.
- [ ] **Step 4:** Run: `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat: awards story in the group feed`

---

### Task 7: Шаги наград в опросе и итоги в матче

**Files:**
- Modify: `apps/miniapp/src/screens/ReviewRater.tsx`
- Modify: `apps/miniapp/src/screens/MatchReview.tsx`
- Create: `apps/miniapp/src/components/AwardPicker.tsx` (список участников с одним выбором)
- Create: `apps/miniapp/src/components/MatchAwards.tsx` (блок итогов)
- Modify: CSS в `apps/miniapp/src/styles/` (файл, где лежат стили `review-*`)
- Test: `apps/miniapp/test/Ratings.test.tsx`

**Interfaces:**
- Consumes: `AWARDS`, `AWARD_LABEL`, `AWARD_SHORT_LABEL`, `AWARD_QUESTION`, `AwardPicks`, `MatchAwardsDto`, `plural`.
- Produces:
  - `ReviewRater` получает пропсы `awards: AwardPicks` и `onAward: (award: AwardKey, userId: number | null) => void`.
  - `AwardPicker({ label, players, scores, value, disabled, onChange })` — `role="radiogroup"` с `aria-label={label}`, каждая строка `role="radio"`: аватар, имя, справа «твоя оценка N» либо «—», если игрок не оценён.
  - `MatchAwards({ awards }: { awards: MatchAwardsDto })`.

Поведение:
- Порядок шагов: игроки, затем пять наград в порядке `AWARDS`, затем «Матч в целом». Счётчик «N из M» и прогресс учитывают все шаги.
- Если `players` пуст, шагов наград нет.
- Шаг награды: заголовок `AWARD_LABEL`, под ним `AWARD_QUESTION`. «Далее» активна после выбора. «Пропустить награду» снимает выбор и идёт дальше. «Назад» работает как сейчас.
- Заголовок листа «Оценка матча» вместо «Оценка игроков» (в листе теперь не только игроки).
- Сводка на последнем шаге дополняется « · наград: K из 5».
- Правило отправки не меняется: нужна хотя бы одна оценка игрока или оценка матча. Если выбраны только награды, кнопка неактивна, а под ней текст «Чтобы отправить, оцени хотя бы одного игрока или матч».
- `MatchReview`: состояние `awards`, передаётся в `ReviewInput.awards` при отправке (пустой объект не отправлять). В карточке входа — «Награды: K из 5», когда `K > 0`. Вводный текст: «…В конце выбери лучших игроков матча.»
- Закрытый матч: блок «Награды матча» над списком оценок, только если `review.awards !== null`. Пять строк в порядке `AWARDS`: `AWARD_SHORT_LABEL`, имена-ссылки на `/players/:id` («А», «А и Б», «А, Б и В»), число голосов через `plural(n, ['голос', 'голоса', 'голосов'])`. Неприсуждённая награда: «Недостаточно голосов».
- Анимация шага и `prefers-reduced-motion` — как у существующих шагов.

- [ ] **Step 1: Падающие тесты** в `apps/miniapp/test/Ratings.test.tsx` (рядом с существующими тестами опроса, тот же способ мокать `api`)

```tsx
it('shows five award steps after the players and before the match rating', async () => {
  // два игрока оценены → следующий заголовок
  expect(await screen.findByRole('heading', { name: 'MVP матча' })).toBeInTheDocument();
  expect(screen.getByText('3 из 8')).toBeInTheDocument();
  // ... пять раз «Пропустить награду» → заголовок «Матч в целом»
});
it('sends the picked awards with the ratings', async () => {
  await user.click(screen.getByRole('radio', { name: /Ерлан/ })); await user.click(screen.getByRole('button', { name: 'Далее' }));
  // ... до отправки
  expect(api.send).toHaveBeenCalledWith('POST', '/api/events/1/review', expect.objectContaining({ awards: { mvp: 3 } }));
});
it('shows the rating just given next to each candidate', () => { expect(within(row('Ерлан')).getByText('твоя оценка 9')).toBeInTheDocument(); });
it('skipping an award clears the pick and omits awards when none are chosen', async () => { /* body без поля awards */ });
it('has no award steps when there is nobody else to pick', async () => { /* participants: только я → сразу «Матч в целом» */ });
it('cannot submit awards alone', async () => { /* все игроки пропущены, выбрана награда → кнопка disabled, текст-подсказка */ });
it('a closed match lists winners, shared winners and missing awards', async () => {
  // awards: { mvp: {winners:[A], votes:6}, defender: {winners:[C,D,E], votes:3}, forward: null, ... }
  expect(screen.getByText('6 голосов')).toBeInTheDocument();
  expect(screen.getByText(/Ерлан, Санжар и Тимур/)).toBeInTheDocument();
  expect(screen.getAllByText('Недостаточно голосов').length).toBeGreaterThan(0);
});
it('a closed match without awards shows no awards block', async () => { /* awards: null → нет заголовка «Награды матча» */ });
```

- [ ] **Step 2:** Run: `pnpm --filter @altynka/miniapp exec vitest run test/Ratings.test.tsx` → FAIL.
- [ ] **Step 3:** Прочитать `DESIGN.md`, реализовать.
- [ ] **Step 4:** Run: `pnpm --filter @altynka/miniapp exec vitest run && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(miniapp): award steps in the match poll and winners on the closed match`

---

### Task 8: Награды в профиле, достижениях и статистике

**Files:**
- Modify: `apps/miniapp/src/components/PlayerSports.tsx` (строка наград рядом с голами и ассистами)
- Modify: `apps/miniapp/src/components/PlayerAchievements.tsx`, `apps/miniapp/src/components/Icon.tsx` (значки `star`, `medal`)
- Modify: `apps/miniapp/src/screens/Statistics.tsx` (вкладка «MVP»)
- Modify: `apps/miniapp/src/screens/MatchRatings.tsx` (тексты карточки)
- Test: `apps/miniapp/test/PlayerSports.test.tsx`, `PlayerAchievements.test.tsx`, `Statistics.test.tsx`

**Interfaces:**
- Consumes: `PlayerStatistics.awards/mvps/positionAwards`, `LeaderboardRowDto.mvps`, `AWARD_SHORT_LABEL`.

Поведение:
- `PlayerSports`: в сетке показателей новая ячейка «MVP» со значением `statistics.mvps`. Ниже строка «Лучший на позиции» с четырьмя счётчиками (`Нападающий 2 · Полузащитник 0 · Защитник 1 · Вратарь 0`); строка скрыта, когда `positionAwards === 0`.
- `PlayerAchievements`: две новые лестницы отображаются теми же компонентами; проверить вёрстку сетки на семи карточках при ширине 360 px.
- `Statistics`: вкладка «MVP» (ключ `mvps`) последней; полоса вкладок с шестью пунктами должна прокручиваться, а не переноситься.
- `MatchRatings`: для `open` — «Оцени участников, выбери лучших и оцени сам матч. Можно пропустить любого игрока.»; для `closed` кнопка «Посмотреть итоги».

- [ ] **Step 1: Падающие тесты**

```tsx
it('shows the MVP count and the position awards breakdown', () => {
  renderSports({ ...stats, mvps: 2, positionAwards: 3, awards: { mvp: 2, forward: 2, midfielder: 0, defender: 1, goalkeeper: 0 } });
  expect(within(cell('MVP')).getByText('2')).toBeInTheDocument();
  expect(screen.getByText(/Нападающий 2/)).toBeInTheDocument();
});
it('hides the breakdown when there are no position awards', () => { expect(screen.queryByText('Лучший на позиции')).toBeNull(); });
it('renders the MVP and position ladders', () => { expect(screen.getByText('Лучший на позиции')).toBeInTheDocument(); /* в PlayerAchievements.test.tsx */ });
it('the MVP tab ranks players by MVP awards', async () => { await user.click(screen.getByRole('tab', { name: 'MVP' })); /* первый — игрок с mvps: 3 */ });
```

- [ ] **Step 2:** Run три файла → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** Run: `pnpm --filter @altynka/miniapp exec vitest run && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(miniapp): awards in the profile, achievements and leaderboard`

---

### Task 9: Браузерные сценарии, документация, полная проверка

**Files:**
- Modify: `tests/ui/player-ratings.spec.ts` (и его мок `review()`: поле `awards`)
- Modify: `tests/ui/game-statistics-fixture.ts`, `tests/ui/player-statistics.spec.ts`, `tests/ui/statistics.spec.ts`, `tests/ui/news-feed.spec.ts` (новые поля DTO в фикстурах)
- Modify: `README.md` (разделы «Игровые рейтинги», лента, достижения), `docs/superpowers/specs/2026-11-15-match-awards-design.md` (статус «реализовано»)

- [ ] **Step 1: Сценарии Playwright** в `tests/ui/player-ratings.spec.ts`

```ts
test('picks awards between player ratings and the match rating', async ({ page }) => {
  // оценить игроков → шаг «MVP матча» → выбрать → четыре шага → «Матч в целом» → отправить
  expect(sentBody.awards).toEqual({ mvp: 2 });
});
test('a closed match shows the awards block', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Награды матча' })).toBeVisible();
});
test('award step has no accessibility violations', async ({ page }) => { /* axe, как в соседних сценариях */ });
```

- [ ] **Step 2:** Run: `pnpm test:ui` → новые сценарии FAIL до правки фикстур, затем PASS в проектах Chromium и мобильного WebKit.
- [ ] **Step 3: README.** В «Игровые рейтинги»: пять наград, правило победителя (голоса, средняя, общая награда, минимум два голоса), открытие итогов при закрытии, миграция `0018_match_awards.sql` перед деплоем Worker. В разделе ленты: вид «Награды матча» и то, что он заменяет «Лучший по оценкам» при присуждённом MVP. В достижениях: две новые лестницы с порогами.
- [ ] **Step 4: Полная проверка**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm test:ui && pnpm test:migrations`
Expected: всё PASS; записать число тестов для будущего `docs/match-awards-deployment.md`.

- [ ] **Step 5: Commit** `docs: match awards in README; UI scenarios`

Выкат (миграция на удалённую D1, деплой, запись `docs/match-awards-deployment.md`) — отдельно и только по команде владельца.
