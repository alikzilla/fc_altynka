# Церемония награждения — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** пост «Церемония» с каруселью карточек победителей, личное поздравление победителям, корона действующего MVP и блок наград из карточек на странице матча.

**Architecture:** тексты и сборка поста — чистые функции в `packages/core`; Worker один раз пишет пост `ceremony` с `payload_json` при чтении ленты после закрытия голосования, поздравление отправляет DO матча (`AutomaticNotifications`), корона считается при чтении функцией `reigningMvps`. Победители везде берутся только из `awardsByEvent`.

**Tech Stack:** TypeScript, Hono + Drizzle + D1, Durable Objects, React 19, vitest (workers pool, happy-dom), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-23-award-ceremony-design.md` — тексты шаблонов копировать оттуда дословно.

## Global Constraints

- Весь пользовательский текст на русском. Имя игрока — только именительный падеж; о человеке — настоящее время или без глагола; по имени только хвалим (правила в шапке `packages/core/src/feed.ts`).
- Наружу из голосования выходит только `votes` победителя; никакой раскладки голосов.
- Победители — только через `awardsByEvent` / `awardWinners`.
- Миграция `0019_feed_payload.sql` применяется к удалённой D1 до деплоя Worker.
- Новый горизонтальный скроллер `.ceremony-cards` — в `HORIZONTAL_SCROLLERS` (`tests/ui/fixtures.ts`); страница на 320 px не скроллится вбок.
- Импорты относительные, без алиасов. Новые таблицы не добавляются (колонка — не таблица, `TABLES` в `test/setup.ts` не трогаем).
- Поздравление: не раньше `closesAt`, тихие часы через `nextDeliveryTime`, не позже `closesAt + 24 ч`, одно на человека за матч.

## Review Focus

1. **Игрок без аккаунта Telegram в личке / с выключенными уведомлениями** — поздравление молча не уходит, в группу не падает (тест в Task 3).
2. **Матч без протокола игр (старый, `protocolVersion 0`)** — карточки и поздравление без строки цифр, без `undefined`/`NaN` в тексте (тесты в Task 1 и Task 3).
3. **Длинное имя без пробелов на 320 px** в карточке церемонии и плитке наград — без бокового скролла (Task 5, Task 6 через `horizontal-scroll.spec.ts`).
4. **Победитель вышел из группы** до закрытия опроса — пост всё равно пишется (имя из `users`), корона не показывается у неактивного участника в списке игроков (Task 4: список берёт только `active` членства — проверить тестом).
5. **Опрос закрыт досрочно ночью** — поздравление приходит в 10:00 по Алматы, а не сразу и не через 72 часа (Task 3).

---

### Task 1: Тексты и сборка поста в core

**Files:**
- Create: `packages/core/src/ceremony.ts`
- Modify: `packages/core/src/feed.ts` (вид `'ceremony'`, `FeedDraft.payload`, `FeedPostDto.ceremony`, `composeCeremonyPost`)
- Modify: `packages/core/src/index.ts` (экспорт `ceremony.ts`)
- Test: `packages/core/test/ceremony.test.ts`

**Interfaces:**
- Produces (в `ceremony.ts`):
  ```ts
  export interface CeremonyStats { goals: number; assists: number | null; games: number; wins: number }
  export interface CeremonyCard { award: AwardKey; userId: number; title: string; text: string; votes: number; stats: CeremonyStats | null; sharedWith: number[] }
  export interface CeremonyCardDto extends CeremonyCard { name: string; photoUrl: string | null }
  export interface CeremonyWinner { award: AwardKey; userId: number; name: string; votes: number; stats: CeremonyStats | null; sharedWith: number[] }
  export const CEREMONY_TITLES: Record<AwardKey, readonly string[]>;
  export function ceremonyLines(award: AwardKey, v: { name: string; date: string; votes: number; stats: CeremonyStats | null }): readonly string[];
  export function awardProgress(ladder: 'mvp' | 'position-best', total: number, won: number):
    { total: number; raised: AchievementTier | null; nextTier: AchievementTier | null; remaining: number | null };
  ```
- Produces (в `feed.ts`):
  ```ts
  FEED_KINDS: ... 'top_rated', 'awards', 'ceremony', ...
  interface FeedDraft { ...; payload?: CeremonyCard[] }
  interface FeedPostDto { ...; ceremony?: CeremonyCardDto[] }
  export function composeCeremonyPost(v: { eventId: number; date: string; winners: readonly CeremonyWinner[]; recent?: RecentVariants }): FeedDraft | null;
  ```

- [ ] **Step 1: Write the failing tests** в `packages/core/test/ceremony.test.ts`:

```ts
const A = { userId: 1, name: 'Алихан' }, B = { userId: 2, name: 'Дамир' }, C = { userId: 3, name: 'Ерлан' };
const stats = (goals: number, assists: number | null, wins = 1) => ({ goals, assists, games: 5, wins });
const w = (award: AwardKey, p: { userId: number; name: string }, extra: Partial<CeremonyWinner> = {}): CeremonyWinner =>
  ({ award, userId: p.userId, name: p.name, votes: 4, stats: null, sharedWith: [], ...extra });

test('one card per winner in AWARDS order, signed by a single MVP', () => {
  const post = composeCeremonyPost({ eventId: 1, date: '2026-11-14', winners: [w('defender', C), w('mvp', A, { votes: 6 }), w('forward', B)] })!;
  expect(post).toMatchObject({ kind: 'ceremony', slot: 'ceremony', userId: 1 });
  expect(post.payload!.map(c => [c.award, c.userId])).toEqual([['mvp', 1], ['forward', 2], ['defender', 3]]);
  expect(post.payload![0].votes).toBe(6);
  expect(post.payload!.every(c => c.text.includes(c.userId === 1 ? 'Алихан' : c.userId === 2 ? 'Дамир' : 'Ерлан'))).toBe(true);
  expect(CEREMONY_TITLES.mvp).toContain(post.payload![0].title);
});
test('no MVP: unsigned, and the post text never says «MVP —»', () => {
  for (let eventId = 1; eventId <= 20; eventId++) {
    const post = composeCeremonyPost({ eventId, date: '2026-11-14', winners: [w('goalkeeper', A)] })!;
    expect(post.userId).toBeNull();
    expect(post.text).not.toContain('MVP —');
  }
});
test('nobody won: no post', () => expect(composeCeremonyPost({ eventId: 1, date: '2026-11-14', winners: [] })).toBeNull());
test('number lines appear only when their condition holds', () => {
  expect(ceremonyLines('forward', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(1, 0) }).some(l => l.includes('за вечер и лучший нападающий'))).toBe(false);
  expect(ceremonyLines('forward', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(3, 0) }).some(l => l.includes('3 гола'))).toBe(true);
  expect(ceremonyLines('midfielder', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(0, null) }).some(l => /пас/.test(l))).toBe(false);
  expect(ceremonyLines('mvp', { name: 'А', date: '2026-11-14', votes: 3, stats: stats(2, 1) }).some(l => l.includes('2 гола и 1 пас'))).toBe(true);
  expect(ceremonyLines('defender', { name: 'А', date: '2026-11-14', votes: 3, stats: null }).join(' ')).not.toMatch(/undefined|NaN|null/);
});
test('two winners of one award get different phrasings; shared ids are kept', () => {
  for (let eventId = 1; eventId <= 20; eventId++) {
    const post = composeCeremonyPost({ eventId, date: '2026-11-14', winners: [w('defender', A, { sharedWith: [2] }), w('defender', B, { sharedWith: [1] })] })!;
    const [a, b] = post.payload!;
    expect(a.text.replace('Алихан', 'X')).not.toBe(b.text.replace('Дамир', 'X'));
    expect(a.sharedWith).toEqual([2]);
  }
});
test('no masculine past-tense verbs about a person in any template', () => {
  const all = AWARDS.flatMap(award => ceremonyLines(award, { name: 'А', date: '2026-11-14', votes: 3, stats: stats(4, 3, 4) }));
  // \b в JS не видит кириллицу, поэтому границы слова заданы явно.
  for (const line of all) expect(line).not.toMatch(/(^|[^а-яё])(забил|отдал|сыграл|получил|стал|провёл|сделал)([^а-яё]|$)/i);
});
test('award progress: new tier, next target, top of the ladder', () => {
  expect(awardProgress('mvp', 3, 1)).toEqual({ total: 3, raised: 'bronze', nextTier: 'silver', remaining: 2 });
  expect(awardProgress('mvp', 4, 1)).toEqual({ total: 4, raised: null, nextTier: 'silver', remaining: 1 });
  expect(awardProgress('position-best', 100, 1)).toMatchObject({ raised: 'legend', nextTier: null, remaining: null });
});
```

- [ ] **Step 2: Run** `pnpm --filter @altynka/core exec vitest run test/ceremony.test.ts` — Expected: FAIL (модуль не найден).

- [ ] **Step 3: Implement `ceremony.ts`.** Тексты, титулы и условия «с цифрами» — дословно из раздела «Тексты» спеки. `ceremonyLines` возвращает общие строки плюс строки с цифрами, если условие выполнено (смесь, не замена). Формы: `{голоса}` = `plural(votes,'голос','голоса','голосов')`, `{пасы}` = `plural(n,'пас','паса','пасов')`, `{г+п}` = «N гола и M паса» (без пасов, если `assists` null или 0 — условие MVP тогда считает только голы). `awardProgress` строит `PlayerStatistics`-подобный объект `{ mvps: total }` / `{ positionAwards: total }` и вызывает `playerAchievements`, сравнивая уровень для `total` и `total - won`.

- [ ] **Step 4: Implement `composeCeremonyPost` в `feed.ts`.** Один `Voice` на матч. Общий текст поста — `voice.say('ceremony', 'ceremony', 0, lines)` из четырёх строк спеки (без MVP — только две без «MVP — А»; смещение 10, чтобы варианты не путались). Карточка: текст — `voice.say('ceremony', 'ceremony:<award>:<userId>', OFFSET[award], ceremonyLines(...))`, титул — `voice.say('ceremony', 'title:<award>:<userId>', TITLE_OFFSET[award], CEREMONY_TITLES[award])`; `OFFSET = { mvp: 100, forward: 200, midfielder: 300, defender: 400, goalkeeper: 500 }`, `TITLE_OFFSET` = те же + 50. Сортировка по индексу в `AWARDS`, затем `userId`. `highlights` — имена всех победителей; `userId` — единственный MVP или `null`. Добавить `'ceremony'` в `FEED_KINDS` после `'awards'`.

- [ ] **Step 5: Run** `pnpm --filter @altynka/core exec vitest run` — Expected: PASS (включая старый `feed.test.ts`). Затем `pnpm typecheck` — miniapp упадёт на `Record<FeedKind, …>` в `NewsFeed.tsx`: добавить временно `ceremony: 'trophy'` в `ICON` и `ceremony: 'Церемония'` в `LABEL` (финальная отрисовка — Task 5).

- [ ] **Step 6: Commit**

```bash
git add packages/core apps/miniapp/src/components/NewsFeed.tsx
git commit -m "feat(core): award ceremony post with a card per winner"
```

---

### Task 2: Пост `ceremony` в ленте Worker

**Files:**
- Create: `apps/worker/migrations/0019_feed_payload.sql`; Modify: `apps/worker/migrations/meta/_journal.json` (idx 19, tag `0019_feed_payload`)
- Modify: `apps/worker/src/db/schema.ts` (`feedPosts.payloadJson: text('payload_json')`)
- Modify: `apps/worker/src/domain/feed.ts` (`row`, `publishAwards`, `awardsToPublish`, `publishClosedVotes`, `listFeed`)
- Test: `apps/worker/test/domain/feed.test.ts` (переписать четыре теста про `awards`)

**Interfaces:**
- Consumes: `composeCeremonyPost`, `CeremonyWinner`, `CeremonyStats`, `CeremonyCard` (Task 1); `awardsByEvent`; `parseGameState(ev)` из `domain/gameStore`; `summarizePlayerProtocol` из core.
- Produces: `listFeed` отдаёт у постов `ceremony` поле `ceremony: CeremonyCardDto[]` (имя `users.displayName`, фото `users.photoUrl`). Экспорт `ceremonyWinners(d: Deps, eventId: number, result: MatchAwardResults): Promise<CeremonyWinner[]>` — Task 3 переиспользует для поздравления.

- [ ] **Step 1: Переписать тесты** в `feed.test.ts` (те же сценарии, вид `ceremony`):

```ts
test('the ceremony is posted once after voting closes and replaces the best-rated post when an MVP exists', async () => {
  // те же голоса, что в старом тесте: mvp → people[0], goalkeeper → people[4]
  ...
  const post = (await feed(w))[0];
  expect(post).toMatchObject({ kind: 'ceremony', userId: w.people[0].id });
  expect(post.ceremony!.map(c => [c.award, c.userId, c.votes])).toEqual([['mvp', w.people[0].id, 3], ['goalkeeper', w.people[4].id, 3]]);
  expect(post.ceremony![0]).toMatchObject({ name: 'Игрок 0', photoUrl: null, stats: { goals: 3, games: 2, wins: 2 } });
  expect((await kinds(w)).filter(k => k === 'ceremony')).toHaveLength(1);
  expect(await kinds(w)).not.toContain('top_rated');
  expect(await kinds(w)).not.toContain('awards');
});
test('without an MVP the best-rated post still appears next to the ceremony', ...);        // kind 'ceremony', userId null
test('a match where no award reached two votes is not picked up for publishing again', ...); // not.toContain('ceremony')
test('a match with a winner is picked up once and leaves the queue after its post is written', ...);
test('a match that already has an old awards post never gets a ceremony', async () => {
  // после play() и голосов вставить строку feed_posts kind 'awards', slot 'awards'; сдвинуть время
  expect(await awardsToPublish(w.d, [w.community.id])).toEqual([]);
  expect(await kinds(w)).not.toContain('ceremony');
});
test('the ceremony survives a correction of the match result unchanged', ...); // editGameResult после публикации → тот же id и payload
```

- [ ] **Step 2: Run** `pnpm --filter @altynka/worker exec vitest run test/domain/feed.test.ts` — Expected: FAIL.

- [ ] **Step 3: Миграция** `ALTER TABLE feed_posts ADD COLUMN payload_json TEXT;` + журнал + схема.

- [ ] **Step 4: Implement.** `row()` пишет `payloadJson: draft.payload ? JSON.stringify(draft.payload) : null`. `ceremonyWinners`: имена из `match_participants`, `stats` из `summarizePlayerProtocol(parseGameState(ev), userId)` если `ev.protocolVersion === 1` и игр > 0, иначе `null`; `assists` = `assistsTracked ? assists : null`; `sharedWith` — остальные победители той же награды. `publishAwards` вызывает `composeCeremonyPost` вместо `composeAwardsPost`. `awardsToPublish`: `f.kind IN ('awards','ceremony')`. `publishClosedVotes`: условие `(f.kind IN ('awards','ceremony') AND f.position = ${AWARDS_WITH_MVP})`. `listFeed`: для строк с `payloadJson` собрать id игроков карточек в общий запрос `users` и вернуть `ceremony`. Переписывание постов матча (`onConflictDoUpdate` в функции записи историй) не должно задевать слот `ceremony` — проверить, что она трогает только свои слоты; если удаляет посты матча целиком, исключить `kind IN ('top_rated','awards','ceremony')`.

- [ ] **Step 5: Run** `pnpm --filter @altynka/worker exec vitest run test/domain/feed.test.ts test/api/feed.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/migrations apps/worker/src/db/schema.ts apps/worker/src/domain/feed.ts apps/worker/test/domain/feed.test.ts
git commit -m "feat(worker): ceremony post replaces the awards post for newly closed votes"
```

---

### Task 3: Личное поздравление победителям

**Files:**
- Modify: `apps/worker/src/render/personal.ts` (`personalAwards`)
- Modify: `apps/worker/src/sync/automatic.ts` (задачи `award:<closesAt>:<tgId>`, `nextAt`)
- Modify: `apps/worker/src/domain/ratings.ts` (`closeReview` будит DO)
- Test: `apps/worker/test/render/personal.test.ts` (создать), `apps/worker/test/sync/automatic.test.ts`, `apps/worker/test/domain/ratings.test.ts`

**Interfaces:**
- Consumes: `awardsByEvent`, `ceremonyWinners` (Task 2), `playerAwardCounts(db, userId, userId, now)` из `domain/awards.ts`, `awardProgress` (Task 1), `nextDeliveryTime`.
- Produces:
  ```ts
  export function personalAwards(env: LinkEnv, view: EventView, v: {
    seed: string;                                   // `${eventId}:${tgId}` — выбор первой строки
    awards: { award: AwardKey; votes: number; sharedWith: string[] }[];   // в порядке AWARDS
    stats: CeremonyStats | null;
    progress: { ladder: 'mvp' | 'position-best'; total: number; raised: AchievementTier | null; nextTier: AchievementTier | null; remaining: number | null }[];
  }): Rendered;
  ```

- [ ] **Step 1: Failing render tests** (`test/render/personal.test.ts`):

```ts
test('a single MVP: title without gender, votes, numbers, progress, button to the match', () => {
  const r = personalAwards(env, view, { seed: '1:5', awards: [{ award: 'mvp', votes: 6, sharedWith: [] }],
    stats: { goals: 3, assists: 2, games: 5, wins: 4 }, progress: [{ ladder: 'mvp', total: 3, raised: null, nextTier: 'silver', remaining: 2 }] });
  expect(r.html).toContain('<b>🏆 MVP матча — это ты · ');
  expect(r.html).toContain('За тебя проголосовали 6 партнёров.');
  expect(r.html).toContain('За матч: 3 гола, 2 паса, 4 победы в 5 играх.');
  expect(r.html).toContain('Это твоя 3-я награда MVP. До серебра — ещё 2.');
  expect(r.keyboard?.inline_keyboard[0][0]).toMatchObject({ text: 'Посмотреть награды', url: expect.stringContaining(`startapp=e${view.id}`) });
});
test('two awards: counted title and a list; a shared award names the partner', () => {
  const r = personalAwards(env, view, { seed: '1:5', awards: [{ award: 'mvp', votes: 6, sharedWith: [] }, { award: 'forward', votes: 3, sharedWith: ['Дамир'] }], stats: null, progress: [] });
  expect(r.html).toContain('Две награды за матч');
  expect(r.html).toContain('MVP матча — 6 голосов');
  expect(r.html).toContain('Награда на двоих: ты и Дамир.');
  expect(r.html).not.toContain('За матч:');
});
test('a new tier is announced instead of the distance to it', () => {
  const r = personalAwards(env, view, { seed: '1:5', awards: [{ award: 'goalkeeper', votes: 2, sharedWith: [] }], stats: null,
    progress: [{ ladder: 'position-best', total: 1, raised: 'wood', nextTier: 'bronze', remaining: 4 }] });
  expect(r.html).toContain('Лучший вратарь матча — ты');
  expect(r.html).toContain('Новый уровень: «Лучший на позиции», дерево.');
});
```
`view`/`env` — как в существующих render-тестах (`test/render/notices.test.ts`).

- [ ] **Step 2: Failing DO tests** в `automatic.test.ts`, на базе `world()` с третьим участником `Ерлан` (tgId 502, уведомления и личка включены). Два голоса за `payer` как MVP:

```ts
test('award winners are congratulated once after voting closes, in delivery hours', async () => {
  // finish, два submitReview с awards: { mvp: payer.id }, now = closesAt, flush
  const congrats = () => w.personal().filter(m => m.html.includes('MVP матча — это ты'));
  expect(congrats()).toHaveLength(1);
  await w.stub.request(w.ev, { parts: [], review: true }); await w.flush();
  expect(congrats()).toHaveLength(1);
  expect(tg.sent.filter(m => m.chatId === 502 && m.html.includes('это ты'))).toHaveLength(0); // не победитель
});
test('nothing is computed or sent before voting closes', ...);           // now = closesAt - 1 → 0 поздравлений; alarm ≤ closesAt
test('an early close at night congratulates at 10:00 Almaty', ...);      // closeReview ночью → alarm = nextDeliveryTime(closesAt)
test.each(['disabled', 'unavailable', 'stale'] as const)('no congratulation when %s, and none in the group', ...);
// stale: now = closesAt + 25 ч перед первым flush
```

- [ ] **Step 3: Failing domain test** в `test/domain/ratings.test.ts`: после `closeReview(d, ev.id)` в `d.sync.calls` есть `{ eventId: ev.id, req: { parts: [], review: true } }`; повторный `closeReview` уже закрытого опроса новый вызов не добавляет.

- [ ] **Step 4: Run** `pnpm --filter @altynka/worker exec vitest run test/render/personal.test.ts test/sync/automatic.test.ts test/domain/ratings.test.ts` — Expected: FAIL.

- [ ] **Step 5: Implement `personalAwards`.** Заголовки: `mvp` «MVP матча — это ты», `forward` «Лучший нападающий матча — ты», `midfielder` «Лучший полузащитник матча — ты», `defender` «Лучший защитник матча — ты», `goalkeeper` «Лучший вратарь матча — ты»; 2–5 наград — «Две/Три/Четыре/Пять наград за матч» и строки `${AWARD_LABEL} — N голосов`. Первая строка — по первой награде, варианты из спеки, выбор `hash(seed) % n`. «За тебя проголосовали N партнёров.» только при одной награде. Строка цифр: «За матч: N гола, M паса, K побед в G играх.» (пасы опускаются при `null`/0). Прогресс: `raised` → «Новый уровень: «<title>», <tier lower>.»; иначе «Это твоя N-я награда <MVP|на позиции>.» + « До <ACHIEVEMENT_TIER_TO без «До »…> — ещё K.» если `nextTier`. Кнопка `miniAppLink(env, 'e'+view.id)`. `teamTitle(view)` в начале, как у остальных.

- [ ] **Step 6: Implement в `automatic.ts`.** Под `auto:reviewArmed`: если `now < review.closesAt` — задач нет, но `nextAt` возвращает `min(…, review.closesAt)`. Если `review.closesAt <= now < review.closesAt + 24 ч` — `awardsByEvent` + `ceremonyWinners`, группировка по `userId`, для каждого победителя с `tgId` задача `award:${closesAt}:${tgId}`, `at = nextDeliveryTime(closesAt)`, пропуск если `at > closesAt + 24 ч`. Прогресс: `playerAwardCounts` → для `mvp` и суммы позиций `awardProgress(ladder, total, wonHere)`, только для лестниц, где есть награда этого матча.

- [ ] **Step 7: Implement в `closeReview`.** Взять `changes` из результата `UPDATE`; если `> 0` — `await d.sync.request(eventId, { parts: [], review: true })`. Прогнать весь `pnpm --filter @altynka/worker test` и поправить тесты, которые проверяют точный список `d.sync.calls`.

- [ ] **Step 8: Run** `pnpm --filter @altynka/worker test` — Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/worker/src/render/personal.ts apps/worker/src/sync/automatic.ts apps/worker/src/domain/ratings.ts apps/worker/test
git commit -m "feat(worker): congratulate award winners in private once voting closes"
```

---

### Task 4: Корона действующего MVP (сервер)

**Files:**
- Modify: `apps/worker/src/domain/awards.ts` (`reigningMvps`)
- Modify: `packages/core/src/api.ts` (`SignupDto.reigningMvp?: boolean`), `packages/core/src/ratings.ts:51` (рядом с `injured`: `reigningMvp?: boolean`), DTO профиля (рядом с его `injured`)
- Modify: `apps/worker/src/domain/eventView.ts:133`, `apps/worker/src/api/ratings.ts:35-46`, `apps/worker/src/domain/ratings.ts:93`
- Test: `apps/worker/test/domain/awards.test.ts`, `apps/worker/test/api/ratings.test.ts`

**Interfaces:**
- Produces: `reigningMvps(db: Db, communityIds: number[], now: number): Promise<Map<number, number[]>>` — communityId → userId победителей MVP последнего (по `closes_at DESC, id DESC`) закрытого неотменённого матча группы с присуждённым MVP; просмотр не дальше 10 последних таких матчей с голосами `mvp`.

- [ ] **Step 1: Failing tests** в `awards.test.ts` (фикстуры `reviewedMatch`, `vote`, `NOW` из `awardsFixture.ts`):

```ts
test('the crown belongs to the MVP of the latest closed match and passes on', async () => {
  // матч 1 закрыт: MVP = A (2 голоса); матч 2 закрыт позже: MVP = B
  expect((await reigningMvps(db(), [c.id], NOW)).get(c.id)).toEqual([B.id]);
});
test('a later match without an MVP leaves the crown where it was', ...);   // матч 2: голоса только за defender
test('an open vote and a cancelled match do not move the crown', ...);
test('a shared MVP crowns both', ...);
```
В `api/ratings.test.ts`: `/api/players` отдаёт `reigningMvp: true` только у хозяина короны в своей группе; `/api/players/:id` — `reigningMvp` у профиля; карточка матча (`eventView`) — у signup.

- [ ] **Step 2: Run** `pnpm --filter @altynka/worker exec vitest run test/domain/awards.test.ts test/api/ratings.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `reigningMvps` (один запрос кандидатов на все группы, `awardsByEvent`, первый с MVP на группу) и флаги: список игроков — по группе строки; `eventView` — по `ev.communityId`; профиль — если игрок хозяин короны в любой группе из того же набора, что и запрос `roles` (свои или общие со зрителем активные группы).

- [ ] **Step 4: Run** `pnpm --filter @altynka/worker test && pnpm typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src apps/worker/src apps/worker/test
git commit -m "feat(worker): reigning MVP flag in players, lineups and profiles"
```

---

### Task 5: Пост «Церемония» в мини-аппе

**Files:**
- Create: `apps/miniapp/src/components/CeremonyPost.tsx`
- Create: `apps/miniapp/src/styles/ceremony.css` (подключить там же, где остальные feature-CSS)
- Modify: `apps/miniapp/src/components/NewsFeed.tsx`
- Modify: `tests/ui/fixtures.ts` (`'.ceremony-cards'` в `HORIZONTAL_SCROLLERS`)
- Test: `apps/miniapp/test/Home.test.tsx`, `tests/ui/news-feed.spec.ts`, `tests/ui/horizontal-scroll.spec.ts`

**Interfaces:**
- Consumes: `FeedPostDto.ceremony: CeremonyCardDto[]`, `AWARD_LABEL`, `plural`.
- Produces: `CeremonyCards({ cards, onOpen }: { cards: CeremonyCardDto[]; onOpen: (userId: number) => void })`.

- [ ] **Step 1: Failing tests** в `Home.test.tsx` (лента с постом `ceremony` из трёх карточек, мок `/api/feed`):

```ts
test('a ceremony post shows one card per winner and pages through them', async () => {
  // карточки: mvp Алихан (votes 6, stats {3,2,5,4}), forward Дамир, defender Ерлан (sharedWith [4]) + Санжар
  expect(await screen.findByText('Главный герой вечера')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Награды матча' })).toBeInTheDocument();
  expect(screen.getAllByRole('group', { name: /из 4/ })).toHaveLength(4);           // каждая карточка: «1 из 4» …
  expect(screen.getByText('6 голосов')).toBeInTheDocument();
  expect(screen.getByText('Награда на двоих · Ерлан и Санжар')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Следующая награда' }));
  expect(screen.getByText('2 из 4')).toBeInTheDocument();
});
test('a ceremony card opens the winner profile', ...);   // клик по карточке → PlayerProfileSheet с userId карточки
test('an old awards post still renders as plain text', ...);
test('a player with two awards gets the «2 награды за вечер» chip on both cards', ...);
```
Playwright `news-feed.spec.ts`: пост `ceremony` в обеих темах, axe без нарушений, скриншотов не добавлять. `horizontal-scroll.spec.ts`: в фикстуру ленты добавить пост `ceremony` с длинным именем без пробелов.

- [ ] **Step 2: Run** `pnpm --filter @altynka/miniapp exec vitest run test/Home.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement.** В `NewsFeed` пост `ceremony` с `ceremony?.length` рисуется отдельной веткой: шапка (`Avatar` MVP или иконка `trophy`, «Церемония · день») и текст — ссылка `/event/:id`; ниже `CeremonyCards`; затем обычный ряд реакций и меню администратора. Без `ceremony` (защитно) — как текстовый пост. Карусель — как `.match-carousel` на главной: `role="region" aria-label="Награды матча"`, scroll snap, карточки ≈86 % ширины, кнопки «Предыдущая награда»/«Следующая награда» и «N из M» (`aria-live="polite"`), прокрутка `instant` при reduced motion. Карточка — `<button>` с `role="group"`-обёрткой `aria-label="N из M"`: подпись награды (`AWARD_LABEL`), фото 72 px (`Avatar large`), имя, титул, текст, строка цифр («3 гола · 2 паса · 4 победы из 5»; пасы при `null` скрыты; без `stats` строки нет), «6 голосов», чипы «Награда на двоих · …» и «2 награды за вечер». MVP — `data-award="mvp"` с золотым материалом из `.stat-pod[data-medal=gold]`; остальные — графит, кольцо фото и подпись в цвете награды; цвета задать токенами в `ceremony.css` с переопределением в светлой теме (`themes.css`). Длинные имена: `overflow-wrap: anywhere`, `min-width: 0`.

- [ ] **Step 4: Run** `pnpm --filter @altynka/miniapp test && pnpm build && pnpm exec playwright test tests/ui/news-feed.spec.ts tests/ui/horizontal-scroll.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp tests/ui
git commit -m "feat(miniapp): ceremony post with a card per award winner"
```

---

### Task 6: Блок наград на матче и корона на аватаре

**Files:**
- Modify: `apps/miniapp/src/components/MatchAwards.tsx`, `apps/miniapp/src/styles/ratings.css:131-140`
- Modify: `apps/miniapp/src/components/Icon.tsx` (`Avatar` проп `crowned`)
- Modify: `apps/miniapp/src/screens/Players.tsx:46`, `apps/miniapp/src/screens/EventList.tsx:35`, `apps/miniapp/src/components/PlayerSports.tsx:57` (+ проброс из `PlayerProfile.tsx:17`, `Profile.tsx:72`)
- Test: `apps/miniapp/test/Ratings.test.tsx`, `apps/miniapp/test/Players.test.tsx`, `apps/miniapp/test/PlayerSports.test.tsx`, `tests/ui/player-ratings.spec.ts`

**Interfaces:**
- Consumes: `reigningMvp` из Task 4, `MatchAwardsDto` (уже с `photoUrl`).
- Produces: `Avatar({ ..., crowned?: boolean })`.

- [ ] **Step 1: Failing tests:**

```ts
// Ratings.test.tsx
test('closed match: MVP in a gold hero card, positions as four tiles', () => {
  // awards: mvp Алихан 6, forward Дамир 4, defender Ерлан и Санжар 3, midfielder null, goalkeeper null
  const hero = container.querySelector('.match-award-hero')!;
  expect(hero.textContent).toContain('MVP матча'); expect(hero.textContent).toContain('Алихан'); expect(hero.textContent).toContain('6 голосов');
  expect(container.querySelectorAll('.match-award-tile')).toHaveLength(4);
  expect(screen.getAllByText('Недостаточно голосов')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'Ерлан' })).toHaveAttribute('href', '/players/…');
});
test('without an MVP the hero card says so', ...);
// Players.test.tsx
test('the reigning MVP wears a crown', ...);   // getByTestId('crown-badge') у одного игрока, sr-only «Действующий MVP»
// PlayerSports.test.tsx
test('the profile of the reigning MVP shows the chip', ...);   // текст «Действующий MVP»
```

- [ ] **Step 2: Run** `pnpm --filter @altynka/miniapp exec vitest run test/Ratings.test.tsx test/Players.test.tsx test/PlayerSports.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement.** `MatchAwards`: карточка `.match-award-hero` (золотой материал, `Avatar` 64 px первого победителя, подпись «MVP матча», имена-ссылки, корона, голоса; без MVP — «Недостаточно голосов» в приглушённой карточке), под ней `.match-award-tiles` — сетка `repeat(2, minmax(0, 1fr))` из четырёх `.match-award-tile` (подпись `AWARD_SHORT_LABEL`, аватар 32 px, имена-ссылки «А и Б», голоса). `Avatar crowned`: значок `data-testid="crown-badge"` в правом верхнем углу (SVG короны, золото), `sr-only` «Действующий MVP». `PlayerSportsCard`: проп `reigningMvp` → `Avatar crowned` и чип «Действующий MVP» под аватаром.

- [ ] **Step 4: Run** `pnpm --filter @altynka/miniapp test && pnpm build && pnpm exec playwright test tests/ui/player-ratings.spec.ts tests/ui/horizontal-scroll.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp tests/ui
git commit -m "feat(miniapp): award cards on the match page and a crown for the reigning MVP"
```

---

### Task 7: Документация и полная проверка

**Files:**
- Modify: `README.md` (разделы «Награды матча» и «Лента»: поздравление, корона, «Церемония» вместо поста наград для новых матчей, миграция `0019` перед деплоем)
- Modify: `DESIGN.md` (строка 160 — блок наград; описание ленты — пост «Церемония»; аватар — корона)

- [ ] **Step 1: Обновить README и DESIGN.md** по спеке, в настоящем времени, без истории изменений.
- [ ] **Step 2: Run** `pnpm typecheck && pnpm test && pnpm test:ui` — Expected: всё зелёное; записать числа тестов для будущего отчёта о деплое.
- [ ] **Step 3: Commit**

```bash
git add README.md DESIGN.md
git commit -m "docs: award ceremony, congratulations and the MVP crown"
```
