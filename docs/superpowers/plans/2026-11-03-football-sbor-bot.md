# Сбор на футбол: бот + мини-апп (MVP) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram-бот и мини-апп, которые ведут сбор на футбол (запись, резерв, назначение игры, составы, счёт) одним
самообновляющимся сообщением в группе вместо ручных списков.

**Architecture:** pnpm-монорепо из трёх пакетов. `packages/core` — чистая доменная логика (очередь, команды, счёт,
форматирование) и типы API, общие для сервера и мини-аппа. `apps/worker` — один Cloudflare Worker: вебхук grammY,
JSON-API на Hono, D1 через Drizzle, Durable Object `EventSync`, который склеивает правки сообщений в группе и шлёт
уведомления. `apps/miniapp` — React + Vite, раздаётся тем же Worker'ом как статика.

**Tech Stack:** TypeScript 5.9, Cloudflare Workers + D1 + Durable Objects, grammY, Hono, Drizzle ORM, zod, React 19,
Vite 8, wouter, Vitest 4.1 (+ @cloudflare/vitest-pool-workers, happy-dom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-11-03-football-sbor-bot-design.md`

## Global Constraints

- Версии: node 24, pnpm 10, `typescript@5.9.3`, `vitest@4.1.12` во всех пакетах (pool-workers 0.23.0 требует `^4.1.0`),
  `@cloudflare/vitest-pool-workers@0.23.0`, `wrangler@4.157.0`, `grammy@1.46.0`, `hono@4.13.16`, `zod@4.6.7`,
  `@hono/zod-validator@0.9.1`, `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`, `react@19.3.1`, `react-dom@19.3.1`,
  `vite@8.3.5`, `@vitejs/plugin-react@6.2.1`, `wouter@3.13.0`, `happy-dom@21.0.4`, `@testing-library/react@16.3.3`,
  `@testing-library/user-event@14.6.8`.
- Часовой пояс всех дат и «сегодня» — `Asia/Almaty`.
- Весь текст интерфейса и сообщений — на русском.
- Лимит: по умолчанию 10; 1 ч → 10; 2 ч → 15. Ручной перевод из резерва = +1 место.
- Возврат на прежнее место: повторное «Иду» в течение 120 000 мс после «Не иду».
- Правки одного сообщения в группе — не чаще одной в 3 000 мс; 429 — повтор через `retry_after`.
- Доля счёта = `ceil(итог / число долей / 50) * 50`; деньги — целые тенге.
- Команды: `red` 🔴 Красные, `blue` 🔵 Синие, `yellow` 🟡 Жёлтые (третья — только при 3 командах). < 15 в основе → 2 команды, ≥ 15 → 3.
- Новичок и гость — уровень 5. Уровни (1–10) никогда не попадают в ответы API для роли `player` и в сообщения группы.
- Все сообщения бота — `parse_mode: "HTML"`, любой пользовательский текст через `escapeHtml`. Отметки людей — `<a href="tg://user?id=…">`.
- Callback data: `j:<eventId>` (Иду), `l:<eventId>` (Не иду), `p:<billId>` (Я скинул).
- `startapp`-параметры мини-аппа: `e<eventId>` — сбор, `g<eventId>` — добавить друга, `b<eventId>` — счёт.
- Ссылка на мини-апп: `https://t.me/<BOT_USERNAME>/<MINIAPP_SHORT_NAME>?startapp=<param>` (web_app-кнопки в группах запрещены).
- В группу бот пишет только сообщения из §5 спеки: сбор, короткие уведомления (ответом на сбор), составы, счёт, напоминание.
- Общее состояние — только в D1. Никакого localStorage для данных.

## Review Focus

1. Всплеск «Иду»: 15 человек жмут одновременно → у каждого свой номер подряд, никто не потерян, сообщение догоняет за ~3 с, а не падает на 429.
2. Повторная доставка вебхука или двойное нажатие («Иду», «Я скинул») → ни дублей записей, ни двойной оплаты.
3. Имя в Telegram с `<`, `&`, эмодзи или очень длинное → сообщение в группе не ломается, имя показано как есть.
4. Номер Kaspi в любом виде (`8 707…`, `+7 (707) …`, `707…`) → сохраняется в одном формате; мусор отклоняется понятной ошибкой.
5. Два человека с одинаковым именем или пользователь, поменявший имя в профиле → различимы; новое нажатие в группе не затирает ручное имя.

---

## Структура файлов

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, .gitignore
packages/core/src/{index,queue,teams,bill,format,api}.ts      + test/*.test.ts
apps/worker/
  wrangler.jsonc, drizzle.config.ts, vitest.config.ts, migrations/
  src/index.ts                 Hono app, fetch handler, export EventSync
  src/env.ts                   тип Env
  src/db/{schema,client}.ts
  src/auth/{initData,middleware}.ts
  src/domain/{members,events,teams,bills}.ts
  src/render/{eventMessage,notices,teamsMessage,billMessage}.ts
  src/telegram/{client,links}.ts
  src/sync/{plan,parts,EventSync,port}.ts
  src/bot/bot.ts
  src/api/{routes,events,teams,bills,members}.ts
  test/{setup,helpers}.ts, test/fakes/{fakeTg,fakeSync}.ts, test/**/*.test.ts
apps/miniapp/
  index.html, vite.config.ts, vitest.config.ts
  src/{main,App}.tsx, src/{tg,api,startParam,useResource}.ts, src/styles.css
  src/screens/{Home,NewEvent,Event,EventList,AddGuest,Schedule,Teams,Bill,Players,Profile}.tsx
  test/*.test.tsx
```

---

### Task 1: Монорепо и очередь (core/queue)

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/queue.ts`
- Test: `packages/core/test/queue.test.ts`

**Interfaces:**
- Produces (из `@sbor/core`):
  - `DEFAULT_LIMIT = 10`, `RESTORE_WINDOW_MS = 120_000`, `type Duration = 1 | 2`
  - `limitFor(duration: Duration | null): number`
  - `interface QueueEntry { id: number; seq: number; manual: boolean }`
  - `interface QueueSplit<T extends QueueEntry> { main: T[]; reserve: T[]; limit: number }`
  - `splitQueue<T extends QueueEntry>(entries: T[], baseLimit: number): QueueSplit<T>`
  - `promotedIds(before: QueueSplit<QueueEntry>, after: QueueSplit<QueueEntry>): number[]`
  - `demotedIds(before: QueueSplit<QueueEntry>, after: QueueSplit<QueueEntry>): number[]`
  - `canRestore(leftAt: number | null, now: number): boolean`

- [ ] **Step 1: Скаффолд.** `git init`; корневой `package.json` (private, `packageManager: "pnpm@10"`, скрипты `test` → `pnpm -r test`, `typecheck` → `pnpm -r typecheck`); `pnpm-workspace.yaml` с `packages/*`, `apps/*`; `tsconfig.base.json` (strict, `module: "ESNext"`, `moduleResolution: "Bundler"`, `target: "ES2022"`); `.gitignore`: `node_modules`, `dist`, `.wrangler`, `.dev.vars`. Пакет `@sbor/core` с `"main": "src/index.ts"` (собирать не нужно, потребители бандлят исходники), скрипты `test: vitest run`, `typecheck: tsc --noEmit`. `pnpm install`.

- [ ] **Step 2: Тесты**

```ts
// packages/core/test/queue.test.ts
const e = (seq: number, manual = false) => ({ id: seq, seq, manual });
const ids = (xs: { id: number }[]) => xs.map(x => x.id);

test('limitFor', () => {
  expect(limitFor(null)).toBe(10); expect(limitFor(1)).toBe(10); expect(limitFor(2)).toBe(15);
});
test('first N by seq are main, rest reserve, input order ignored', () => {
  const s = splitQueue([12, 3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11].map(n => e(n)), 10);
  expect(ids(s.main)).toEqual([1,2,3,4,5,6,7,8,9,10]); expect(ids(s.reserve)).toEqual([11,12]); expect(s.limit).toBe(10);
});
test('manual promotion adds a seat over the limit', () => {
  const list = Array.from({ length: 12 }, (_, i) => e(i + 1, i + 1 === 12));
  const s = splitQueue(list, 10);
  expect(ids(s.main)).toEqual([1,2,3,4,5,6,7,8,9,10,12]); expect(ids(s.reserve)).toEqual([11]); expect(s.limit).toBe(11);
});
test('leaver from main is replaced by first reservist, manual keeps its seat', () => {
  const list = Array.from({ length: 12 }, (_, i) => e(i + 1, i + 1 === 12)).filter(x => x.seq !== 3);
  expect(ids(splitQueue(list, 10).main)).toEqual([1,2,4,5,6,7,8,9,10,11,12]);
});
test('2h -> 1h sends last non-manual back to reserve in order', () => {
  const list = Array.from({ length: 16 }, (_, i) => e(i + 1));
  const a = splitQueue(list, 15), b = splitQueue(list, 10);
  expect(ids(b.reserve)).toEqual([11,12,13,14,15,16]);
  expect(demotedIds(a, b)).toEqual([11,12,13,14,15]);
  expect(promotedIds(b, a)).toEqual([11,12,13,14,15]);
});
test('canRestore window', () => {
  expect(canRestore(1_000_000 - 119_999, 1_000_000)).toBe(true);
  expect(canRestore(1_000_000 - 120_001, 1_000_000)).toBe(false);
  expect(canRestore(null, 1_000_000)).toBe(false);
});
```

- [ ] **Step 3:** `pnpm --filter @sbor/core test -- queue` → FAIL (функций нет).
- [ ] **Step 4: Реализовать `queue.ts`.** main = все `manual` + первые `baseLimit` не-manual по `seq`, итог отсортирован по `seq`; reserve = остальные не-manual по `seq`; `limit = baseLimit + manual.length`. Реэкспорт из `index.ts`.
- [ ] **Step 5:** `pnpm --filter @sbor/core test -- queue` → PASS; `pnpm --filter @sbor/core typecheck` → без ошибок.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(core): monorepo scaffold and signup queue rules"`

---

### Task 2: Деление команд (core/teams)

**Files:**
- Create: `packages/core/src/teams.ts`
- Test: `packages/core/test/teams.test.ts`

**Interfaces:**
- Produces:
  - `TEAMS: readonly [{key:'red',name:'Красные',emoji:'🔴'},{key:'blue',name:'Синие',emoji:'🔵'},{key:'yellow',name:'Жёлтые',emoji:'🟡'}]`
  - `type TeamCount = 2 | 3`; `teamCountFor(mainCount: number): TeamCount`
  - `interface Rated { id: number; level: number }`
  - `spread(teams: Rated[][]): number` — max(сумма) − min(сумма)
  - `makeRng(seed: number): () => number` — детерминированный ГПСЧ (mulberry32)
  - `balanceTeams(players: Rated[], count: TeamCount, rng?: () => number): number[][]` — массив id по командам в порядке `TEAMS`
  - `alternativeSplit(players: Rated[], count: TeamCount, current: number[][], rng?: () => number): number[][]`

- [ ] **Step 1: Тесты**

```ts
const P = (levels: number[]) => levels.map((level, i) => ({ id: i + 1, level }));
const sums = (players: Rated[], t: number[][]) => t.map(ids => ids.reduce((s, id) => s + players.find(p => p.id === id)!.level, 0));
const canon = (t: number[][]) => JSON.stringify(t.map(x => [...x].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]));

test('teamCountFor', () => { expect(teamCountFor(10)).toBe(2); expect(teamCountFor(14)).toBe(2); expect(teamCountFor(15)).toBe(3); });
test('10 players -> 2x5, optimal spread 1', () => {
  const ps = P([10,9,8,7,6,5,4,3,2,1]); const t = balanceTeams(ps, 2, makeRng(1));
  expect(t.map(x => x.length)).toEqual([5,5]);
  const s = sums(ps, t); expect(Math.max(...s) - Math.min(...s)).toBe(1);
});
test('15 players -> 3x5, spread <= 1, every id exactly once', () => {
  const ps = P([1,2,3,4,5,6,7,8,9,10,1,2,3,4,5].map((x, i) => x + (i % 3)));
  const t = balanceTeams(ps, 3, makeRng(7));
  expect(t.map(x => x.length)).toEqual([5,5,5]);
  expect(t.flat().sort((a, b) => a - b)).toEqual(ps.map(p => p.id));
  const s = sums(ps, t); expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
});
test('11 players -> sizes 6 and 5', () => { expect(balanceTeams(P(Array(11).fill(5)), 2).map(x => x.length)).toEqual([6,5]); });
test('alternativeSplit differs from current and is within best+1', () => {
  const ps = P([7,7,6,6,5,5,5,4,4,3]); const best = balanceTeams(ps, 2, makeRng(3));
  const alt = alternativeSplit(ps, 2, best, makeRng(4));
  expect(canon(alt)).not.toBe(canon(best));
  const sb = sums(ps, best), sa = sums(ps, alt);
  expect(Math.max(...sa) - Math.min(...sa)).toBeLessThanOrEqual(Math.max(...sb) - Math.min(...sb) + 1);
});
```

- [ ] **Step 2:** `pnpm --filter @sbor/core test -- teams` → FAIL.
- [ ] **Step 3: Реализовать `teams.ts`.** Размеры: первые `n % count` команд получают `ceil(n/count)`, остальные `floor`. Алгоритм — 200 рестартов: случайное распределение по слотам → локальный поиск обменами пар игроков между командами, пока сумма-разброс уменьшается; лучший результат возвращается. `alternativeSplit`: те же рестарты, копит различные (по канонической форме) расклады с разбросом ≤ лучший + 1, исключает `current`, выбирает случайный; если таких нет — возвращает лучший.
- [ ] **Step 4:** `pnpm --filter @sbor/core test -- teams` → PASS.
- [ ] **Step 5: Commit** `git add packages/core && git commit -m "feat(core): team balancing by level"`

---

### Task 3: Счёт, форматирование, типы API (core/bill, core/format, core/api)

**Files:**
- Create: `packages/core/src/bill.ts`, `packages/core/src/format.ts`, `packages/core/src/api.ts`
- Test: `packages/core/test/bill.test.ts`, `packages/core/test/format.test.ts`

**Interfaces:**
- Produces:
  - `ROUND_TO = 50`; `interface Extra { label: string; amount: number }`; `interface BillPayerInput { userId: number; units: number }`
  - `computeBill(fieldAmount: number, extras: Extra[], payers: BillPayerInput[]): { total: number; share: number; lines: { userId: number; units: number; amount: number }[] }` — бросает `Error` при нулевом числе долей
  - `type LineState = 'unpaid' | 'paid' | 'underpaid'`; `lineStatus(amount: number, paidAmount: number | null): { state: LineState; due: number }`
  - `plural(n, one, few, many): string`; `formatTenge(n: number): string`; `todayAlmaty(now: Date): string`;
    `formatDateRu(date: string): string`; `normalizeKzPhone(input: string): string | null`; `formatKzPhone(e164: string): string`;
    `defaultDisplayName(first: string, last?: string | null): string`; `escapeHtml(s: string): string`
  - `api.ts` — только типы:
    - `type Role = 'admin' | 'organizer' | 'player'`; `type EventStatus = 'collecting' | 'scheduled' | 'billing' | 'closed' | 'cancelled'`
    - `MeDto { userId; displayName; role: Role; kaspiPhone: string | null }`
    - `SignupDto { id; seq; name; userId: number | null; guestOfName: string | null; invitedByUserId: number | null; manual: boolean; level?: number }`
    - `EventSummaryDto { id; date; status: EventStatus; startTime: string | null; durationHours: 1 | 2 | null; place: string | null; limit; mainCount; reserveCount; my: 'main' | 'reserve' | null }`
    - `TeamsDto { teamCount: 2 | 3; teams: number[][]; publishedAt: number | null; stale: boolean }`
    - `BillLineDto { id; userId; name; units; amount; paidAmount: number | null; state: LineState; due }`
    - `BillDto { id; receiver: { userId; name; kaspiPhone: string }; fieldAmount; extras: Extra[]; total; share; status: 'open' | 'closed'; lines: BillLineDto[] }`
    - `EventDetailDto extends EventSummaryDto { comment: string | null; main: SignupDto[]; reserve: SignupDto[]; teams: TeamsDto | null; bill: BillDto | null }`
    - `MemberDto { userId; displayName; role: Role; level: number }`; `EventsListDto { active: EventSummaryDto[]; past: EventSummaryDto[] }`

- [ ] **Step 1: Тесты счёта**

```ts
const ones = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: i + 1, units: 1 }));
test('splits field + extras, rounds share up to 50', () => {
  const b = computeBill(20000, [{ label: 'Вода', amount: 1500 }], ones(10));
  expect(b.total).toBe(21500); expect(b.share).toBe(2150); expect(b.lines[0].amount).toBe(2150);
  expect(computeBill(20000, [], ones(12)).share).toBe(1700);
});
test('guest units multiply the line', () => {
  const b = computeBill(20000, [], [{ userId: 1, units: 2 }, ...ones(8).map(x => ({ ...x, userId: x.userId + 1 }))]); // 10 долей
  expect(b.share).toBe(2000); expect(b.lines[0].amount).toBe(4000);
});
test('no payers throws', () => { expect(() => computeBill(1000, [], [])).toThrow(); });
test('lineStatus', () => {
  expect(lineStatus(2000, null)).toEqual({ state: 'unpaid', due: 2000 });
  expect(lineStatus(2000, 2000)).toEqual({ state: 'paid', due: 0 });
  expect(lineStatus(2500, 2000)).toEqual({ state: 'underpaid', due: 500 });
  expect(lineStatus(2000, 2500)).toEqual({ state: 'paid', due: 0 });
});
```

- [ ] **Step 2: Тесты форматирования** (Review Focus 4, 5)

```ts
test('plural', () => {
  expect([1,3,5,11,21,22,112].map(n => plural(n, 'гол', 'гола', 'голов'))).toEqual(['гол','гола','голов','голов','гол','гола','голов']);
});
test('formatTenge uses NBSP', () => {
  expect(formatTenge(2000)).toBe('2 000 ₸'); expect(formatTenge(150)).toBe('150 ₸');
  expect(formatTenge(1234567)).toBe('1 234 567 ₸');
});
test('todayAlmaty is UTC+5', () => { expect(todayAlmaty(new Date('2026-11-03T19:30:00Z'))).toBe('2026-11-04'); });
test('formatDateRu', () => { expect(formatDateRu('2026-11-07')).toBe('суббота, 7 ноября'); });
test('normalizeKzPhone accepts common forms, rejects junk', () => {
  for (const s of ['87071234567', '+7 (707) 123-45-67', '7071234567', '8 707 123 45 67']) expect(normalizeKzPhone(s)).toBe('+77071234567');
  for (const s of ['12345', 'abc', '+1 202 555 0100', '']) expect(normalizeKzPhone(s)).toBeNull();
});
test('formatKzPhone', () => { expect(formatKzPhone('+77071234567')).toBe('+7 707 123 45 67'); });
test('defaultDisplayName', () => {
  expect(defaultDisplayName('Дамир', 'Касымов')).toBe('Дамир К.'); expect(defaultDisplayName('  Дамир ', '')).toBe('Дамир');
  expect(defaultDisplayName('Дамир', null)).toBe('Дамир');
});
test('escapeHtml', () => { expect(escapeHtml('<b>A&B</b>')).toBe('&lt;b&gt;A&amp;B&lt;/b&gt;'); });
```

- [ ] **Step 3:** `pnpm --filter @sbor/core test` → FAIL на новых тестах.
- [ ] **Step 4: Реализовать.** `todayAlmaty`/`formatDateRu` — через `Intl.DateTimeFormat` с `timeZone: 'Asia/Almaty'` (для `formatDateRu` парсить дату как полдень UTC и форматировать в UTC). `normalizeKzPhone`: оставить цифры; 11 цифр с ведущей `8` или `7` → `+7` + последние 10; 10 цифр → `+7` + они; иначе `null`. Реэкспорт всего из `index.ts`.
- [ ] **Step 5:** `pnpm --filter @sbor/core test && pnpm --filter @sbor/core typecheck` → PASS.
- [ ] **Step 6: Commit** `git add packages/core && git commit -m "feat(core): bill split, formatting helpers, API types"`

---

### Task 4: Worker — каркас, база, initData, участники

**Files:**
- Create: `apps/worker/{package.json,tsconfig.json,wrangler.jsonc,drizzle.config.ts,vitest.config.ts}`, `apps/worker/src/{index.ts,env.ts}`, `apps/worker/src/db/{schema.ts,client.ts}`, `apps/worker/src/auth/initData.ts`, `apps/worker/src/domain/members.ts`, `apps/worker/migrations/0000_init.sql` (генерируется)
- Test: `apps/worker/test/{setup.ts,helpers.ts}`, `apps/worker/test/auth/initData.test.ts`, `apps/worker/test/domain/members.test.ts`

**Interfaces:**
- Produces:
  - `interface Env { DB: D1Database; ASSETS: Fetcher; EVENT_SYNC: DurableObjectNamespace<EventSync>; BOT_TOKEN: string; WEBHOOK_SECRET: string; BOT_USERNAME: string; MINIAPP_SHORT_NAME: string; ADMIN_TG_ID: string }`
  - `type Db = DrizzleD1Database<typeof schema>`; `getDb(d1: D1Database): Db`
  - Таблицы Drizzle (`schema.ts`): `communities(id, tgChatId unique, title)`; `users(id, tgId unique, firstName, lastName?, username?, displayName, kaspiPhone?, createdAt)`; `memberships(communityId, userId, role 'organizer'|'player', level default 5, PK(communityId,userId))`; `events(id, communityId, date, comment?, startTime?, durationHours?, place?, status default 'collecting', baseLimit default 10, teamCount?, teamsPublishedAt?, eventMessageId?, teamsMessageId?, createdBy, createdAt)`; `signups(id, eventId, userId?, guestName?, invitedBy?, seq, manual default false, leftAt?, guestLevel?, createdAt; unique(eventId, seq); unique(eventId, userId) where userId not null)`; `teamAssignments(signupId PK, eventId, teamIndex)`; `bills(id, eventId unique, receiverUserId, fieldAmount, extrasJson, share, status default 'open', messageId?, createdAt)`; `billLines(id, billId, userId, units, amount, paidAmount?, markedBy?, paidAt?; unique(billId, userId))`
  - `verifyInitData(raw: string, botToken: string, nowSec: number, maxAgeSec?: number): Promise<TgWebAppUser | null>`, `TgWebAppUser { id: number; first_name: string; last_name?: string; username?: string }`
  - `members.ts`: `getCommunity(db): Promise<CommunityRow | null>`; `bindCommunity(db, tgChatId: number, title: string): Promise<CommunityRow>` (единственная запись: создать или заменить chat id); `upsertTgUser(db, u: TgWebAppUser, now: number): Promise<UserRow>`; `ensureMembership(db, communityId, userId): Promise<MembershipRow>`; `effectiveRole(env: Pick<Env,'ADMIN_TG_ID'>, user: UserRow, m: MembershipRow | null): Role`
  - Тестовые хелперы: `seedCommunity()`, `seedUser(name: string, opts?: { role?: 'organizer'|'player'; level?: number; tgId?: number }): Promise<UserRow>`, `signInitData(user: TgWebAppUser, botToken: string, authDateSec: number): Promise<string>`

- [ ] **Step 1: Каркас.** Пакет `@sbor/worker` (deps: `@sbor/core` workspace, grammy, hono, drizzle-orm, zod, @hono/zod-validator; dev: wrangler, drizzle-kit, vitest, @cloudflare/vitest-pool-workers, typescript). `wrangler.jsonc`: `main: src/index.ts`, `compatibility_flags: ["nodejs_compat"]`, D1 binding `DB` (`migrations_dir: "migrations"`), Durable Object `EVENT_SYNC` → класс `EventSync` с миграцией `new_sqlite_classes`, assets `{ directory: "../miniapp/dist", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: ["/api/*", "/tg/*"] }`, `vars`: `BOT_USERNAME`, `MINIAPP_SHORT_NAME`, `ADMIN_TG_ID`. `src/index.ts` пока: Hono с `GET /api/health → {ok:true}` и пустой класс `EventSync extends DurableObject`. `vitest.config.ts` — по README установленной версии pool-workers: читает `wrangler.jsonc`, миграции D1 через `readD1Migrations` в binding `TEST_MIGRATIONS`, тестовые биндинги `BOT_TOKEN="test-token"`, `WEBHOOK_SECRET="test-secret"`, `ADMIN_TG_ID="1"`; `test/setup.ts` применяет миграции `applyD1Migrations`. Для `dist` ассетов в тестах достаточно пустой папки `apps/miniapp/dist/.gitkeep`.
- [ ] **Step 2: Схема и миграция.** Описать `schema.ts`; `pnpm --filter @sbor/worker exec drizzle-kit generate` → `migrations/0000_init.sql`.
- [ ] **Step 3: Тесты**

```ts
// test/auth/initData.test.ts
const u = { id: 42, first_name: 'Азамат' };
test('accepts valid signature', async () => {
  const raw = await signInitData(u, 'test-token', 1_700_000_000);
  expect(await verifyInitData(raw, 'test-token', 1_700_000_100)).toMatchObject({ id: 42, first_name: 'Азамат' });
});
test('rejects tampered, wrong token, expired', async () => {
  const raw = await signInitData(u, 'test-token', 1_700_000_000);
  expect(await verifyInitData(raw.replace('42', '43'), 'test-token', 1_700_000_100)).toBeNull();
  expect(await verifyInitData(raw, 'other', 1_700_000_100)).toBeNull();
  expect(await verifyInitData(raw, 'test-token', 1_700_000_000 + 86_401)).toBeNull();
});
// test/domain/members.test.ts  (Review Focus 5)
test('upsertTgUser sets default display name once and never overwrites a custom one', async () => {
  const db = getDb(env.DB);
  const a = await upsertTgUser(db, { id: 7, first_name: 'Дамир', last_name: 'Касымов' }, 1);
  expect(a.displayName).toBe('Дамир К.');
  await db.update(users).set({ displayName: 'Дамир-вратарь' }).where(eq(users.id, a.id));
  const b = await upsertTgUser(db, { id: 7, first_name: 'Дамир', last_name: 'Новый' }, 2);
  expect(b.displayName).toBe('Дамир-вратарь'); expect(b.lastName).toBe('Новый');
});
test('ensureMembership creates player with level 5, effectiveRole honours ADMIN_TG_ID', async () => {
  const db = getDb(env.DB); const c = await seedCommunity();
  const user = await upsertTgUser(db, { id: 1, first_name: 'Админ' }, 1);
  const m = await ensureMembership(db, c.id, user.id);
  expect(m).toMatchObject({ role: 'player', level: 5 });
  expect(effectiveRole({ ADMIN_TG_ID: '1' }, user, m)).toBe('admin');
  expect(effectiveRole({ ADMIN_TG_ID: '999' }, user, m)).toBe('player');
});
```

- [ ] **Step 4:** `pnpm --filter @sbor/worker test` → FAIL.
- [ ] **Step 5: Реализовать** `initData.ts` (по документации Telegram: `secret = HMAC_SHA256(key="WebAppData", msg=botToken)`; `hash = hex(HMAC_SHA256(secret, data_check_string))`, где `data_check_string` — пары `key=value` без `hash`, отсортированные по ключу, через `\n`; сравнение в постоянное время; `auth_date` не старше `maxAgeSec`, по умолчанию 86 400; через `crypto.subtle`), `members.ts`, хелперы тестов (`signInitData` — тот же алгоритм).
- [ ] **Step 6:** `pnpm --filter @sbor/worker test && pnpm --filter @sbor/worker typecheck` → PASS.
- [ ] **Step 7: Commit** `git add apps/worker apps/miniapp/dist/.gitkeep && git commit -m "feat(worker): scaffold, D1 schema, initData auth, members"`

---

### Task 5: Worker — сбор и очередь (domain/events)

**Files:**
- Create: `apps/worker/src/domain/events.ts`, `apps/worker/src/sync/port.ts`, `apps/worker/test/fakes/fakeSync.ts`
- Test: `apps/worker/test/domain/events.test.ts`

**Interfaces:**
- Consumes: `splitQueue`, `promotedIds`, `demotedIds`, `canRestore`, `limitFor` (Task 1); `Db`, схема (Task 4).
- Produces:
  - `sync/port.ts`: `type Part = 'event' | 'teams' | 'bill'`; `type Notice = { kind: 'promoted'; signupIds: number[] } | { kind: 'demoted'; signupIds: number[] } | { kind: 'scheduled' } | { kind: 'cancelled' } | { kind: 'reminder'; billId: number }`; `interface SyncRequest { parts: Part[]; notices?: Notice[] }`; `interface SyncPort { request(eventId: number, req: SyncRequest): Promise<void> }`
  - `interface Deps { db: Db; now: number; sync: SyncPort }`
  - `createEvent(d, { communityId, date, comment, createdBy }): Promise<number>` → `sync: parts ['event']`
  - `type JoinResult = { kind: 'main' | 'reserve'; position: number; restored: boolean } | { kind: 'already'; position: number; inMain: boolean } | { kind: 'closed' } | { kind: 'not_found' }`
  - `joinEvent(d, eventId, userId): Promise<JoinResult>`
  - `leaveEvent(d, eventId, userId): Promise<{ kind: 'left' | 'not_in' | 'closed' | 'not_found' }>`
  - `addGuest(d, eventId, invitedBy: number, name: string): Promise<{ kind: 'main' | 'reserve'; position: number; signupId: number } | { kind: 'closed' } | { kind: 'not_found' }>`
  - `removeSignup(d, signupId, actor: { userId: number; role: Role }): Promise<'ok' | 'forbidden' | 'not_found' | 'closed'>`
  - `promoteSignup(d, signupId): Promise<'ok' | 'not_found' | 'not_reserve' | 'closed'>`
  - `scheduleEvent(d, eventId, { startTime: string; durationHours: 1 | 2; place: string | null }): Promise<'ok' | 'not_found' | 'closed'>`
  - `cancelEvent(d, eventId): Promise<'ok' | 'not_found' | 'closed'>`
  - `loadQueue(db, eventId): Promise<QueueSplit<SignupRow>>` — только `leftAt IS NULL`
  - `FakeSync implements SyncPort { calls: { eventId: number; req: SyncRequest }[] }`

Правила: «закрыт» = статус `billing | closed | cancelled`. Каждая мутация считает очередь до и после; если есть повышенные/пониженные — `notices` `promoted`/`demoted`, всегда `parts ['event']`. `seq` выдаётся одним `INSERT … SELECT COALESCE(MAX(seq),0)+1` (атомарно в D1); нарушение уникальности `(eventId, userId)` при гонке двойного нажатия трактуется как `already`. Выход сам — `leftAt = now`; повторный вход при `canRestore` — `leftAt = NULL` с прежним `seq`, иначе строка удаляется и создаётся новая (в одном `db.batch`). Удаление организатором — удаление строки. При любом удалении/выходе удаляется строка `teamAssignments` этой записи. Гостей может убрать пригласивший или организатор/админ; игрока — только организатор/админ. `scheduleEvent` ставит `baseLimit = limitFor(duration)`, статус `scheduled`, notice `scheduled` (+ promoted/demoted). `cancelEvent` — статус `cancelled`, notice `cancelled`.

- [ ] **Step 1: Тесты** (Review Focus 1, 2)

```ts
// хелпер: d = { db, now, sync: new FakeSync() }; seedEvent() создаёт сбор и возвращает id
test('11th joiner lands in reserve, positions are 1-based', async () => {
  const ev = await seedEvent(); const us = await seedUsers(11);
  for (const u of us.slice(0, 10)) expect((await joinEvent(d, ev, u.id)).kind).toBe('main');
  expect(await joinEvent(d, ev, us[10].id)).toEqual({ kind: 'reserve', position: 1, restored: false });
});
test('join twice keeps one signup', async () => {
  const ev = await seedEvent(); const [u] = await seedUsers(1);
  await joinEvent(d, ev, u.id);
  expect(await joinEvent(d, ev, u.id)).toEqual({ kind: 'already', position: 1, inMain: true });
  expect((await loadQueue(d.db, ev)).main).toHaveLength(1);
});
test('concurrent joins get unique consecutive seqs', async () => {
  const ev = await seedEvent(); const us = await seedUsers(15);
  await Promise.all(us.map(u => joinEvent(d, ev, u.id)));
  const q = await loadQueue(d.db, ev);
  expect([...q.main, ...q.reserve].map(s => s.seq).sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
});
test('leaving main promotes first reservist and emits notice', async () => {
  const ev = await seedEvent(); const us = await seedUsers(11);
  for (const u of us) await joinEvent(d, ev, u.id);
  expect(await leaveEvent(d, ev, us[0].id)).toEqual({ kind: 'left' });
  const q = await loadQueue(d.db, ev);
  expect(q.main.map(s => s.userId)).toContain(us[10].id);
  expect(d.sync.calls.at(-1)!.req.notices).toEqual([{ kind: 'promoted', signupIds: [q.main.at(-1)!.id] }]);
});
test('rejoin within 2 minutes restores the old place, later goes to the end', async () => {
  const ev = await seedEvent(); const us = await seedUsers(3);
  for (const u of us) await joinEvent(d, ev, u.id);
  await leaveEvent(d, ev, us[0].id);
  expect(await joinEvent({ ...d, now: d.now + 60_000 }, ev, us[0].id)).toEqual({ kind: 'main', position: 1, restored: true });
  await leaveEvent({ ...d, now: d.now + 70_000 }, ev, us[0].id);
  expect(await joinEvent({ ...d, now: d.now + 300_000 }, ev, us[0].id)).toEqual({ kind: 'main', position: 3, restored: false });
});
test('schedule 2h promotes 11-15 in one notice; back to 1h demotes them', async () => {
  const ev = await seedEvent(); const us = await seedUsers(16);
  for (const u of us) await joinEvent(d, ev, u.id);
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 2, place: 'Шанырак' });
  const n = d.sync.calls.at(-1)!.req.notices!;
  expect(n).toContainEqual({ kind: 'scheduled' });
  expect(n.find(x => x.kind === 'promoted')!.signupIds).toHaveLength(5);
  expect((await loadQueue(d.db, ev)).main).toHaveLength(15);
  await scheduleEvent(d, ev, { startTime: '21:00', durationHours: 1, place: 'Шанырак' });
  expect(d.sync.calls.at(-1)!.req.notices!.find(x => x.kind === 'demoted')!.signupIds).toHaveLength(5);
});
test('manual promotion adds a seat', async () => { /* 11 joined, promote reserve #1 → main 11, reserve 0, notice promoted */ });
test('guest queues like a player; inviter or organizer can remove, others cannot', async () => { /* addGuest → kind; removeSignup by stranger 'forbidden', by inviter 'ok' */ });
test('player cannot remove another player, organizer can', async () => { /* 'forbidden' / 'ok' */ });
test('list is frozen once status is billing', async () => { /* status=billing → join/leave/addGuest return closed */ });
test('cancel emits cancelled notice', async () => { /* cancelEvent → status cancelled, notices [{kind:'cancelled'}] */ });
```

- [ ] **Step 2:** `pnpm --filter @sbor/worker test -- domain/events` → FAIL.
- [ ] **Step 3: Реализовать** `sync/port.ts`, `domain/events.ts`, `test/fakes/fakeSync.ts`. Тесты-заглушки из Step 1 дописать по комментариям.
- [ ] **Step 4:** `pnpm --filter @sbor/worker test -- domain/events` → PASS.
- [ ] **Step 5: Commit** `git add apps/worker && git commit -m "feat(worker): event signup queue, guests, scheduling"`

---

### Task 6: Worker — тексты сообщения сбора и уведомлений (render)

**Files:**
- Create: `apps/worker/src/render/eventMessage.ts`, `apps/worker/src/render/notices.ts`, `apps/worker/src/telegram/links.ts`
- Test: `apps/worker/test/render/eventMessage.test.ts`, `apps/worker/test/render/notices.test.ts`

**Interfaces:**
- Consumes: `formatDateRu`, `escapeHtml`, `plural` (Task 3).
- Produces:
  - `links.ts`: `miniAppLink(env: Pick<Env,'BOT_USERNAME'|'MINIAPP_SHORT_NAME'>, param?: string): string` (без `param` — без `?startapp`); `mention(tgId: number, name: string): string` → `<a href="tg://user?id=…">escaped</a>`
  - `interface Rendered { html: string; keyboard?: InlineKeyboardMarkup }` (тип из `grammy/types`)
  - `interface PersonView { signupId: number; name: string; tgId: number | null; guestOf: { name: string; tgId: number } | null }`
  - `interface EventView { id: number; date: string; status: EventStatus; startTime: string | null; durationHours: 1 | 2 | null; place: string | null; comment: string | null; limit: number; main: PersonView[]; reserve: PersonView[] }`
  - `renderEventMessage(v: EventView, env): Rendered`
  - `type OutNotice = { kind: 'moves'; promoted: PersonView[]; demoted: PersonView[]; scheduled: boolean } | { kind: 'cancelled' } | { kind: 'reminder'; debtors: PersonView[]; amountByTgId: Record<number, number> }`
  - `renderNotice(n: OutNotice, v: EventView): string`

Содержимое сообщения сбора: заголовок с датой (`formatDateRu`), статус («Время уточняется» / «21:00–23:00 · поле» / «❌ Отменён»), комментарий, пронумерованная основа «N/limit», резерв, гость — «Ержан (друг: Тимур)» (имена не склоняем). Клавиатура при статусах `collecting|scheduled`: ряд «✅ Иду» `j:<id>` / «❌ Не иду» `l:<id>`, ряд URL-кнопок «➕ Друг» (`g<id>`) / «📱 Открыть» (`e<id>`). При других статусах — только «📱 Открыть». `moves`: если `scheduled` — строка «⚽ Игра назначена: <дата>, <время>, <часы> · <поле>»; затем «✅ В основе: …» и «↩️ В резерв: …» с отметками (для гостя отмечается пригласивший).

- [ ] **Step 1: Тесты** (Review Focus 3)

```ts
const env = { BOT_USERNAME: 'sbor_bot', MINIAPP_SHORT_NAME: 'app' };
const person = (i: number, name = `Игрок${i}`): PersonView => ({ signupId: i, name, tgId: 100 + i, guestOf: null });
const base: EventView = { id: 5, date: '2026-11-07', status: 'collecting', startTime: null, durationHours: null, place: null, comment: null, limit: 10, main: [person(1), person(2)], reserve: [person(3)] };

test('collecting message: date, pending time, numbered lists, buttons', () => {
  const r = renderEventMessage(base, env);
  expect(r.html).toContain('суббота, 7 ноября'); expect(r.html).toContain('Время уточняется');
  expect(r.html).toMatch(/1\. Игрок1[\s\S]*2\. Игрок2/); expect(r.html).toContain('Резерв');
  const flat = r.keyboard!.inline_keyboard.flat();
  expect(flat.map(b => ('callback_data' in b ? b.callback_data : b.url))).toEqual(
    ['j:5', 'l:5', 'https://t.me/sbor_bot/app?startapp=g5', 'https://t.me/sbor_bot/app?startapp=e5']);
});
test('scheduled shows time range and place', () => {
  expect(renderEventMessage({ ...base, status: 'scheduled', startTime: '21:00', durationHours: 2, place: 'Шанырак' }, env).html).toContain('21:00–23:00');
});
test('cancelled has no join buttons', () => {
  const r = renderEventMessage({ ...base, status: 'cancelled' }, env);
  expect(r.html).toContain('Отменён'); expect(r.keyboard!.inline_keyboard.flat()).toHaveLength(1);
});
test('guest is labelled with inviter', () => {
  const g = { signupId: 9, name: 'Ержан', tgId: null, guestOf: { name: 'Тимур', tgId: 101 } };
  expect(renderEventMessage({ ...base, main: [g] }, env).html).toContain('Ержан (друг: Тимур)');
});
test('names with HTML and emoji are escaped', () => {
  const r = renderEventMessage({ ...base, main: [person(1, '<Даня> & ⚽')] }, env);
  expect(r.html).toContain('&lt;Даня&gt; &amp; ⚽'); expect(r.html).not.toContain('<Даня>');
});
test('moves notice mentions by tg id, guest promotion mentions inviter', () => {
  const g = { signupId: 9, name: 'Ержан', tgId: null, guestOf: { name: 'Тимур', tgId: 101 } };
  const t = renderNotice({ kind: 'moves', promoted: [person(3), g], demoted: [], scheduled: false }, base);
  expect(t).toContain('<a href="tg://user?id=103">Игрок3</a>'); expect(t).toContain('tg://user?id=101');
});
```

- [ ] **Step 2:** `pnpm --filter @sbor/worker test -- render` → FAIL.
- [ ] **Step 3: Реализовать** `links.ts`, `eventMessage.ts`, `notices.ts`.
- [ ] **Step 4:** `pnpm --filter @sbor/worker test -- render` → PASS.
- [ ] **Step 5: Commit** `git add apps/worker && git commit -m "feat(worker): render event message and notices"`

---

### Task 7: Worker — синхронизация сообщений (Durable Object EventSync)

**Files:**
- Create: `apps/worker/src/sync/plan.ts`, `apps/worker/src/sync/parts.ts`, `apps/worker/src/sync/EventSync.ts`, `apps/worker/src/telegram/client.ts`, `apps/worker/test/fakes/fakeTg.ts`
- Modify: `apps/worker/src/index.ts` (экспорт `EventSync`), `apps/worker/src/sync/port.ts` (добавить `doSyncPort`)
- Test: `apps/worker/test/sync/plan.test.ts`, `apps/worker/test/sync/EventSync.test.ts`

**Interfaces:**
- Consumes: `Part`, `Notice`, `SyncRequest` (Task 5); `renderEventMessage`, `renderNotice`, `EventView`, `OutNotice` (Task 6); `loadQueue` (Task 5).
- Produces:
  - `plan.ts`: `MIN_GAP_MS = 3000`; `nextAlarmAt(now: number, lastSentAt: number | null): number` (= `max(now, lastSentAt + 3000)`); `mergeNotices(pending: Notice[], mainIds: Set<number>): MergedNotice[]`, где `MergedNotice = { kind: 'moves'; promoted: number[]; demoted: number[]; scheduled: boolean } | { kind: 'cancelled' } | { kind: 'reminder'; billId: number }`. Правила: promoted — только те, кто сейчас в основе; demoted — только те, кого сейчас нет в основе; все promoted/demoted/scheduled склеиваются в один `moves` (пустой `moves` без `scheduled` не выдаётся); при наличии `cancelled` — только `[cancelled]`; reminder — без дублей по `billId`.
  - `client.ts`: `interface TgClient { sendMessage(chatId: number, html: string, o?: { replyTo?: number; keyboard?: InlineKeyboardMarkup }): Promise<{ messageId: number }>; editMessage(chatId: number, messageId: number, html: string, keyboard?: InlineKeyboardMarkup): Promise<void>; pinMessage(chatId: number, messageId: number): Promise<void>; isMember(chatId: number, tgUserId: number): Promise<boolean> }`; `class TgRateLimited extends Error { retryAfterSec: number }`; `makeTgClient(env: Env): TgClient` (на `grammy` `Api`; `editMessage` глотает «message is not modified»; `pinMessage` с `disable_notification` и глотает любые ошибки; 429 → `TgRateLimited`); `__setTgClientForTests(c: TgClient | null): void`
  - `parts.ts`: `renderPart(db: Db, env: Env, eventId: number, part: Part): Promise<Rendered | null>` (`teams`/`bill` пока возвращают `null` — их добавят Tasks 10–11); `getMessageId(db, eventId, part): Promise<number | null>`; `setMessageId(db, eventId, part, id): Promise<void>`; `loadEventView(db, eventId): Promise<EventView | null>`; `resolveNotice(db, eventId, n: MergedNotice): Promise<OutNotice>`
  - `EventSync extends DurableObject<Env>`: RPC `request(eventId: number, req: SyncRequest): Promise<void>`; `alarm(): Promise<void>`
  - `port.ts`: `doSyncPort(env: Env): SyncPort` — `env.EVENT_SYNC.get(env.EVENT_SYNC.idFromName('event:' + eventId)).request(eventId, req)`
  - `FakeTg implements TgClient { sent: …[]; edited: …[]; pinned: …[]; failNextWith?: Error; members: Set<number> }`

Поведение `alarm()`: взять из storage `dirty: Part[]`, `pending: Notice[]`; для каждого грязного part — `renderPart`; нет messageId → `sendMessage` (для `teams`/`bill` — ответом на сообщение сбора), сохранить id, для `event` — `pinMessage`; есть → `editMessage`. Затем `mergeNotices` → каждое — `sendMessage` ответом на сообщение сбора. Отправленное удаляется из storage; `lastSentAt = now`. На `TgRateLimited` — остаток остаётся в storage, `setAlarm(now + retryAfterSec*1000)`. `request()` дописывает в storage и, если будильника нет, ставит `nextAlarmAt`.

- [ ] **Step 1: Тесты plan** (Review Focus 1)

```ts
test('nextAlarmAt respects 3s gap', () => {
  expect(nextAlarmAt(10_000, null)).toBe(10_000); expect(nextAlarmAt(10_000, 9_000)).toBe(12_000); expect(nextAlarmAt(10_000, 1_000)).toBe(10_000);
});
test('mergeNotices merges moves and filters by current state', () => {
  const r = mergeNotices([{ kind: 'promoted', signupIds: [1, 2] }, { kind: 'promoted', signupIds: [3] }, { kind: 'scheduled' }, { kind: 'demoted', signupIds: [4] }], new Set([1, 3]));
  expect(r).toEqual([{ kind: 'moves', promoted: [1, 3], demoted: [4], scheduled: true }]);
});
test('cancelled wins, reminders dedupe', () => {
  expect(mergeNotices([{ kind: 'promoted', signupIds: [1] }, { kind: 'cancelled' }], new Set([1]))).toEqual([{ kind: 'cancelled' }]);
  expect(mergeNotices([{ kind: 'reminder', billId: 2 }, { kind: 'reminder', billId: 2 }], new Set())).toEqual([{ kind: 'reminder', billId: 2 }]);
});
```

- [ ] **Step 2: Тесты DO** (через `runInDurableObject` / `runDurableObjectAlarm` из `cloudflare:test`, `__setTgClientForTests(fakeTg)`)

```ts
test('first sync sends and pins, next edits', async () => { /* seed event; request(['event']); run alarm → fakeTg.sent[0], pinned[0]; events.eventMessageId saved; request again; run alarm → fakeTg.edited.length === 1 */ });
test('many requests within the window schedule one alarm and one edit', async () => { /* 15× request(['event']) → getAlarm() set once; run alarm → exactly 1 edit */ });
test('429 keeps work and reschedules by retry_after', async () => { /* fakeTg.failNextWith = new TgRateLimited(5); run alarm → storage still dirty; getAlarm() ≈ now+5000 */ });
test('promotion notice is a reply to the event message and mentions the user', async () => { /* … sent.at(-1).replyTo === eventMessageId; html contains tg://user?id */ });
```

- [ ] **Step 3:** `pnpm --filter @sbor/worker test -- sync` → FAIL.
- [ ] **Step 4: Реализовать** `plan.ts`, `client.ts`, `parts.ts`, `EventSync.ts`, `doSyncPort`, `FakeTg`.
- [ ] **Step 5:** `pnpm --filter @sbor/worker test` → PASS (все предыдущие тоже).
- [ ] **Step 6: Commit** `git add apps/worker && git commit -m "feat(worker): EventSync durable object with debounced edits"`

---

### Task 8: Worker — бот (вебхук, /bind, /start, Иду/Не иду)

**Files:**
- Create: `apps/worker/src/bot/bot.ts`
- Modify: `apps/worker/src/index.ts` (маршрут `POST /tg/webhook`)
- Test: `apps/worker/test/bot/bot.test.ts`

**Interfaces:**
- Consumes: `joinEvent`, `leaveEvent` (Task 5); `bindCommunity`, `upsertTgUser`, `ensureMembership`, `getCommunity` (Task 4); `doSyncPort` (Task 7); `miniAppLink` (Task 6).
- Produces: `createBot(env: Env, deps: { db: Db; sync: SyncPort; now: () => number }): Bot`; `registerCallback(prefix: string, handler)` — внутренний реестр, чтобы Task 11 добавил `p:`.

Поведение:
- Маршрут: `webhookCallback(bot, 'hono', { secretToken: env.WEBHOOK_SECRET })`; `botInfo` кэшируется на уровне модуля после первого `bot.init()`.
- `/bind` в группе — только от `ADMIN_TG_ID`: `bindCommunity`, ответ «Группа привязана ✅». От других — молчание.
- `/start` в личке — сообщение с URL-кнопкой «Открыть» на `miniAppLink(env)`.
- Любой callback: `upsertTgUser` + `ensureMembership` (нажимающий заведомо в группе).
- `j:<id>` → `answerCallbackQuery`: main — «Записал ✅ Ты №N в основе»; reserve — «Мест нет, ты в резерве №N»; restored — «Вернул тебя на твоё место №N»; already — «Ты уже в списке, №N» / «Ты уже в резерве, №N»; closed — «Запись закрыта».
- `l:<id>` → left — «Выписал. Передумал? Жми «Иду» в течение 2 минут — место сохранится»; not_in — «Тебя нет в списке»; closed — «Запись закрыта».
- Неизвестный префикс — пустой `answerCallbackQuery`.

- [ ] **Step 1: Тесты** (через `bot.handleUpdate` с заранее заданным `botInfo` и `bot.api.config.use`, который записывает вызовы и отвечает `{ ok: true, result: true }`)

```ts
test('j: answers with position and records signup', async () => { /* update callback_query from {id: 501, first_name:'Арман'}, data 'j:'+ev → answer text 'Записал ✅ Ты №1 в основе'; loadQueue main length 1 */ });
test('double tap on j: answers "already" and keeps one signup', async () => { /* handleUpdate twice → second answer 'Ты уже в списке, №1' */ });
test('l: answers with restore hint', async () => { /* … contains 'в течение 2 минут' */ });
test('/bind from admin binds group, from others is ignored', async () => { /* message chat {id:-100500,type:'supergroup'}, from {id:1} → getCommunity tgChatId -100500; from {id:2} → no sendMessage call */ });
test('webhook rejects wrong secret', async () => { /* SELF.fetch('/tg/webhook', header X-Telegram-Bot-Api-Secret-Token: 'nope') → 401 */ });
```

- [ ] **Step 2:** `pnpm --filter @sbor/worker test -- bot` → FAIL.
- [ ] **Step 3: Реализовать** `bot.ts`, маршрут вебхука.
- [ ] **Step 4:** `pnpm --filter @sbor/worker test -- bot` → PASS.
- [ ] **Step 5: Commit** `git add apps/worker && git commit -m "feat(worker): telegram bot webhook with join/leave buttons"`

---

### Task 9: Worker — API: авторизация, сборы, участники, профиль

**Files:**
- Create: `apps/worker/src/auth/middleware.ts`, `apps/worker/src/api/{routes,events,members}.ts`
- Modify: `apps/worker/src/index.ts`, `apps/worker/src/domain/events.ts` (добавить `listEvents`, `eventDetail`)
- Test: `apps/worker/test/api/{auth,events,members}.test.ts`, `apps/worker/test/helpers.ts` (добавить `apiRequest`)

**Interfaces:**
- Consumes: всё из Tasks 4–7.
- Produces:
  - `authMiddleware: MiddlewareHandler<AppEnv>` — заголовок `Authorization: tma <initData>`; невалидно → 401; нет привязанной группы → 503; нет membership → `tg.isMember(community.tgChatId, tgId)`: нет → 403 `{error:'not_member'}`, да → `ensureMembership`. Кладёт в `c.var`: `user`, `role`, `community`, `deps`.
  - `requireRole(min: 'organizer' | 'admin')` → 403 `{error:'forbidden'}`
  - `listEvents(db, communityId, viewerUserId): Promise<EventsListDto>` — active: статусы `collecting|scheduled|billing` по дате ↑; past: `closed|cancelled`, последние 5 по дате ↓
  - `eventDetail(db, eventId, viewer: { userId: number; role: Role }): Promise<EventDetailDto | null>` — `level` в `SignupDto` только если роль не `player`; `teams`/`bill` — `null` до Tasks 10–11
  - `apiRequest(path, { method?, body?, as: TgWebAppUser }): Promise<Response>` (через `SELF.fetch`)
  - `setDepsFactoryForTests(f: ((env: Env) => Deps) | null): void` в `api/routes.ts` — подмена `sync` на `FakeSync`
- Маршруты (zod-валидация, ошибки `{ error: string }`):
  - `GET /api/me` → `MeDto`; `PATCH /api/me` `{ displayName?: string(1..24, trim), kaspiPhone?: string | null }` → 400 `{error:'bad_phone'}` если `normalizeKzPhone` вернул null
  - `GET /api/events` → `EventsListDto`; `POST /api/events` (org) `{ date: 'YYYY-MM-DD', comment?: string(..200) }` → `{ id }`
  - `GET /api/events/:id` → `EventDetailDto` | 404
  - `POST /api/events/:id/join` | `/leave` → результат из domain
  - `POST /api/events/:id/guests` `{ name: string(1..24, trim) }`
  - `DELETE /api/signups/:id`; `POST /api/signups/:id/promote` (org)
  - `POST /api/events/:id/schedule` (org) `{ startTime: /^([01]\d|2[0-3]):[0-5]\d$/, durationHours: 1 | 2, place?: string(..80) }`
  - `POST /api/events/:id/cancel` (org)
  - `GET /api/members` (org) → `MemberDto[]`; `PATCH /api/members/:userId` (admin) `{ level?: 1..10, role?: 'organizer' | 'player', displayName?: string(1..24) }`

- [ ] **Step 1: Тесты**

```ts
test('401 without initData, 403 for non-member, member is auto-registered as player', async () => { /* fakeTg.members без 77 → 403 not_member; добавить 77 → GET /api/me 200 role 'player' */ });
test('player gets no levels in event detail, organizer does', async () => {
  /* seed: event с 2 записями; as player → every main[i] has no 'level' key; as organizer → level === 5 */
});
test('player cannot create events or schedule', async () => { /* POST /api/events as player → 403 */ });
test('organizer creates event and it requests a sync', async () => { /* POST /api/events → {id}; GET /api/events active[0].id === id */ });
test('schedule validates time and duration', async () => { /* startTime '25:00' → 400; durationHours 3 → 400 */ });
test('guest name is trimmed and length-checked', async () => { /* name '   ' → 400; 25 chars → 400 */ });
test('PATCH /api/me normalizes Kaspi phone and rejects junk', async () => {
  /* '8 707 123 45 67' → GET me kaspiPhone '+77071234567'; 'abc' → 400 {error:'bad_phone'} */
});
test('only admin edits levels and roles', async () => { /* organizer PATCH members → 403; admin (tgId 1) → 200, level updated */ });
```

- [ ] **Step 2:** `pnpm --filter @sbor/worker test -- api` → FAIL.
- [ ] **Step 3: Реализовать** middleware, маршруты, `listEvents`, `eventDetail`. `deps.sync = doSyncPort(env)`; в тестах подменяется на `FakeSync` через `c.var` (хелпер в `routes.ts`: `setDepsFactoryForTests`).
- [ ] **Step 4:** `pnpm --filter @sbor/worker test` → PASS.
- [ ] **Step 5: Commit** `git add apps/worker && git commit -m "feat(worker): authenticated API for events, members, profile"`

---

### Task 10: Worker — составы (domain/teams + API + сообщение)

**Files:**
- Create: `apps/worker/src/domain/teams.ts`, `apps/worker/src/render/teamsMessage.ts`, `apps/worker/src/api/teams.ts`
- Modify: `apps/worker/src/sync/parts.ts` (part `teams`), `apps/worker/src/domain/events.ts` (`eventDetail.teams`), `apps/worker/src/api/routes.ts`
- Test: `apps/worker/test/domain/teams.test.ts`, `apps/worker/test/render/teamsMessage.test.ts`

**Interfaces:**
- Consumes: `TEAMS`, `TeamCount` (Task 2); `loadQueue` (Task 5); `renderPart` (Task 7).
- Produces:
  - `saveTeams(d, eventId, { teamCount: TeamCount; teams: number[][]; guestLevels: Record<number, number> }): Promise<'ok' | 'invalid' | 'not_found' | 'closed'>` — `invalid`, если `teams.length !== teamCount` или множество id ≠ текущей основе (каждый ровно один раз); пишет `events.teamCount`, строки `teamAssignments`, `signups.guestLevel`
  - `publishTeams(d, eventId): Promise<'ok' | 'no_teams' | 'not_found'>` — `teamsPublishedAt = now`, `sync: parts ['teams']`
  - `teamsDto(db, eventId, mainIds: number[]): Promise<TeamsDto | null>` — `stale` = множество назначенных ≠ основе
  - `renderTeamsMessage(v: { date: string; teams: { emoji: string; name: string; players: string[] }[] }): Rendered` — без уровней, без клавиатуры
  - Маршруты (org): `PUT /api/events/:id/teams` (тело как у `saveTeams`), `POST /api/events/:id/teams/publish`

- [ ] **Step 1: Тесты**

```ts
test('saveTeams rejects missing or duplicated players', async () => { /* 10 in main; teams with 9 ids → 'invalid'; with duplicate → 'invalid'; correct → 'ok' */ });
test('teams become stale when someone leaves', async () => { /* save, leaveEvent one → teamsDto.stale === true */ });
test('publish requests teams part sync', async () => { /* publishTeams → FakeSync last req.parts === ['teams'] */ });
test('teams message has colours and names, never levels', () => {
  const r = renderTeamsMessage({ date: '2026-11-07', teams: [{ emoji: '🔴', name: 'Красные', players: ['Азамат', '<Даня>'] }, { emoji: '🔵', name: 'Синие', players: ['Арман'] }] });
  expect(r.html).toContain('🔴 Красные'); expect(r.html).toContain('&lt;Даня&gt;'); expect(r.html).not.toMatch(/уров|level/i);
});
```

- [ ] **Step 2:** `pnpm --filter @sbor/worker test -- teams` → FAIL.
- [ ] **Step 3: Реализовать**; в `renderPart('teams')` — имена из основы по `teamAssignments`, порядок команд как в `TEAMS`.
- [ ] **Step 4:** `pnpm --filter @sbor/worker test` → PASS.
- [ ] **Step 5: Commit** `git add apps/worker && git commit -m "feat(worker): teams save/publish and group message"`

---

### Task 11: Worker — счёт и оплаты (domain/bills + API + сообщение + кнопка «Я скинул»)

**Files:**
- Create: `apps/worker/src/domain/bills.ts`, `apps/worker/src/render/billMessage.ts`, `apps/worker/src/api/bills.ts`
- Modify: `apps/worker/src/sync/parts.ts` (part `bill`, notice `reminder`), `apps/worker/src/bot/bot.ts` (`p:`), `apps/worker/src/domain/events.ts` (`eventDetail.bill`), `apps/worker/src/api/routes.ts`
- Test: `apps/worker/test/domain/bills.test.ts`, `apps/worker/test/render/billMessage.test.ts`, `apps/worker/test/bot/paid.test.ts`

**Interfaces:**
- Consumes: `computeBill`, `lineStatus`, `normalizeKzPhone`, `formatTenge`, `formatKzPhone` (Task 3); `registerCallback` (Task 8).
- Produces:
  - `upsertBill(d, eventId, { receiverUserId: number; receiverKaspiPhone?: string; fieldAmount: number; extras: Extra[]; participantSignupIds: number[] }): Promise<{ kind: 'ok'; billId: number } | { kind: 'no_kaspi' } | { kind: 'bad_phone' } | { kind: 'invalid' } | { kind: 'not_found' }>` — доли: для каждой записи ответственный = `userId ?? invitedBy`, `units` = число его записей среди участников; статус сбора → `billing`; строка получателя сразу `paidAmount = amount`; при правке существующего счёта `paidAmount` остальных сохраняется; `sync: parts ['bill', 'event']`
  - `markPaid(d, billId, userId, by: number): Promise<'ok' | 'already' | 'not_in_bill' | 'closed'>` — `paidAmount = amount`; если все строки `paid` → счёт и сбор `closed`
  - `setLinePaid(d, lineId, paid: boolean, actor: { userId: number; role: Role }): Promise<'ok' | 'forbidden' | 'not_found'>` — можно организатору/админу или получателю
  - `remindDebtors(d, billId): Promise<'ok' | 'nobody'>` — notice `reminder`
  - `closeBill(d, billId): Promise<'ok' | 'not_found'>`
  - `billDto(db, billId): Promise<BillDto>`
  - `renderBillMessage(v: { share: number; receiver: { name: string; kaspiPhone: string }; lines: { name: string; units: number; amount: number; state: LineState; due: number }[]; status: 'open' | 'closed'; billId: number }): Rendered` — «С каждого по 2 000 ₸ → Азамат, Kaspi +7 707 123 45 67»; ✅/⏳ по строкам; `units > 1` — «за себя и друга» / «за себя и N друзей»; клавиатура при `open`: `copy_text` «📋 Номер Kaspi» (текст — номер в E.164) и «✅ Я скинул» `p:<billId>`; при `closed` — без клавиатуры
  - Маршруты: `PUT /api/events/:id/bill` (org), `POST /api/bills/:id/paid` (сам), `POST /api/bill-lines/:id` `{ paid: boolean }`, `POST /api/bills/:id/remind` (org), `POST /api/bills/:id/close` (org); суммы — целые `0..10_000_000`, `extras` до 10 строк, `label` 1..40
  - Callback `p:<billId>` → «Отметил ✅ Спасибо!» / «Уже отмечено» / «Тебя нет в этом счёте» / «Счёт закрыт»

- [ ] **Step 1: Тесты** (Review Focus 2, 4)

```ts
test('bill splits equally, guest share goes to inviter, receiver is pre-paid', async () => {
  /* 9 игроков + гость Тимура; field 20000, extras [{Вода,1500}] → share 2150; линия Тимура units 2 amount 4300; линия получателя state 'paid'; event.status 'billing' */
});
test('missing Kaspi phone → no_kaspi; junk → bad_phone; valid phone saved to receiver profile', async () => { /* … users.kaspiPhone '+77071234567' */ });
test('markPaid twice is idempotent', async () => { /* 'ok' затем 'already'; paidAmount не меняется */ });
test('raising the amount turns paid lines into underpaid with due', async () => { /* markPaid; upsertBill с fieldAmount больше → billDto line state 'underpaid', due > 0 */ });
test('last payment closes bill and event', async () => { /* все markPaid → bills.status 'closed', events.status 'closed' */ });
test('only organizer or receiver can toggle a line', async () => { /* player → 'forbidden' */ });
test('PUT bill rejects negative and fractional amounts', async () => { /* fieldAmount -1 → 400; 100.5 → 400 */ });
test('bill message: share, receiver, copy button, paid marks', () => {
  const r = renderBillMessage({ share: 2000, receiver: { name: 'Азамат', kaspiPhone: '+77071234567' }, billId: 3, status: 'open',
    lines: [{ name: 'Азамат', units: 1, amount: 2000, state: 'paid', due: 0 }, { name: 'Тимур', units: 2, amount: 4000, state: 'unpaid', due: 4000 }] });
  expect(r.html).toContain('2 000 ₸'); expect(r.html).toContain('+7 707 123 45 67'); expect(r.html).toContain('за себя и друга');
  const flat = r.keyboard!.inline_keyboard.flat();
  expect(flat[0]).toMatchObject({ copy_text: { text: '+77071234567' } }); expect(flat[1]).toMatchObject({ callback_data: 'p:3' });
});
test('p: callback marks paid once', async () => { /* handleUpdate ×2 → 'Отметил ✅ Спасибо!' затем 'Уже отмечено' */ });
```

- [ ] **Step 2:** `pnpm --filter @sbor/worker test -- bill` → FAIL.
- [ ] **Step 3: Реализовать**; `renderPart('bill')` и `resolveNotice(reminder)` — должники с отметками и суммами `due`.
- [ ] **Step 4:** `pnpm --filter @sbor/worker test && pnpm --filter @sbor/worker typecheck` → PASS.
- [ ] **Step 5: Commit** `git add apps/worker && git commit -m "feat(worker): bills, payments, reminders"`

---

### Task 12: Мини-апп — каркас, главная, сбор, запись, гость, создание и назначение

**Files:**
- Create: `apps/miniapp/{package.json,tsconfig.json,index.html,vite.config.ts,vitest.config.ts}`, `apps/miniapp/src/{main.tsx,App.tsx,tg.ts,api.ts,startParam.ts,useResource.ts,styles.css}`, `apps/miniapp/src/screens/{Home,NewEvent,Event,EventList,AddGuest,Schedule}.tsx`
- Test: `apps/miniapp/test/{startParam,Home,EventList}.test.tsx`

**Interfaces:**
- Consumes: DTO-типы и `plural`, `formatDateRu`, `formatTenge` из `@sbor/core`; API из Task 9.
- Produces:
  - `tg.ts`: `initData(): string`; `startParam(): string | undefined`; `ready(): void` (вызывает `ready()` и `expand()`); `haptic(kind: 'light' | 'success' | 'error'): void`; `openLink(url: string): void`; `copy(text: string): Promise<boolean>`; `useBackButton(onBack: (() => void) | null): void`
  - `api.ts`: `class ApiError extends Error { status: number; code: string }`; `api.get<T>(path: string): Promise<T>`; `api.send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T>` — заголовок `Authorization: tma ${initData()}`
  - `useResource<T>(path: string | null): { data: T | undefined; error: ApiError | undefined; loading: boolean; reload(): void }`
  - `routeForStartParam(p: string | undefined): string` — `e12` → `/event/12`, `g12` → `/event/12/guest`, `b12` → `/event/12?tab=bill`, иначе `/`
  - Роуты (wouter): `/` Home, `/new` NewEvent, `/event/:id` Event (`?tab=list|teams|bill`, по умолчанию `list`), `/event/:id/guest` AddGuest, `/event/:id/schedule` Schedule, `/players` Players, `/profile` Profile. Нижняя навигация: «Сборы» · «Игроки» (org+) · «Профиль». При старте `App` один раз делает `navigate(routeForStartParam(startParam()))` и вызывает `ready()`.
  - `Event.tsx` рендерит вкладки и `EventList` для `list`; вкладки `teams`/`bill` подключат Tasks 13–14 (до этого — заглушка «Скоро»).

Стиль: `index.html` подключает `https://telegram.org/js/telegram-web-app.js` и шрифт Onest (Google Fonts). `styles.css` использует CSS-переменные Telegram (`--tg-theme-bg-color`, `--tg-theme-text-color`, `--tg-theme-hint-color`, `--tg-theme-secondary-bg-color`, `--tg-theme-button-color`, `--tg-theme-button-text-color`) с запасными значениями, акцент `#15803D`, радиус карточек 16px, кнопки высотой ≥ 44px. Vite: `server.proxy['/api'] = 'http://localhost:8787'`, `build.outDir = 'dist'`.

Экраны:
- **Home** — карточки активных сборов: дата (`formatDateRu`), статус, «Идут 9/10 · резерв 2», мой статус; кнопка «Новый сбор» (org+); блок «Прошедшие». Пусто — «Ближайших сборов нет».
- **EventList** — шапка (дата, время/«время уточняется», поле); основа нумерованно, резерв, гости «(друг X)»; мои кнопки «Иду»/«Не иду»/«+ Друг»; org: «Назначить игру» → `/schedule`, у резервиста «В основу», у каждого «Убрать» (двухшагово: первое нажатие меняет текст на «Точно убрать?»), «Отменить сбор» (двухшагово).
- **NewEvent** — дата (по умолчанию завтра по Алматы), комментарий → `POST /api/events` → `/event/:id`.
- **AddGuest** — имя → `POST /guests` → назад к сбору; тост с результатом (в основе №N / в резерве №N).
- **Schedule** — время, чипы «1 час · 10 человек» / «2 часа · 15 человек», поле → `POST /schedule`.

- [ ] **Step 1: Скаффолд** пакета `@sbor/miniapp` (deps: react, react-dom, wouter, `@sbor/core`; dev: vite, @vitejs/plugin-react, vitest, happy-dom, @testing-library/react, @testing-library/user-event, typescript). Скрипты `dev`, `build`, `test`, `typecheck`.
- [ ] **Step 2: Тесты** (`vi.mock('../src/api')`, `vi.mock('../src/tg')`)

```ts
test('routeForStartParam', () => {
  expect(routeForStartParam('e12')).toBe('/event/12'); expect(routeForStartParam('g12')).toBe('/event/12/guest');
  expect(routeForStartParam('b12')).toBe('/event/12?tab=bill'); expect(routeForStartParam('zzz')).toBe('/'); expect(routeForStartParam(undefined)).toBe('/');
});
test('Home shows active event with counts and hides "Новый сбор" for players', async () => {
  /* api.get('/api/me') → role player; '/api/events' → active [{date:'2026-11-07', mainCount:9, limit:10, reserveCount:2, ...}] */
  expect(await screen.findByText('суббота, 7 ноября')).toBeInTheDocument();
  expect(screen.getByText(/9\/10/)).toBeInTheDocument(); expect(screen.queryByText('Новый сбор')).toBeNull();
});
test('EventList: "Иду" posts join and reloads', async () => { /* click 'Иду' → api.send('POST','/api/events/5/join') */ });
test('EventList: remove needs two taps', async () => { /* organizer; click 'Убрать' → text 'Точно убрать?', no api call; click again → api.send('DELETE','/api/signups/3') */ });
```

- [ ] **Step 3:** `pnpm --filter @sbor/miniapp test` → FAIL.
- [ ] **Step 4: Реализовать** файлы задачи.
- [ ] **Step 5:** `pnpm --filter @sbor/miniapp test && pnpm --filter @sbor/miniapp typecheck && pnpm --filter @sbor/miniapp build` → PASS, `apps/miniapp/dist/index.html` существует.
- [ ] **Step 6: Commit** `git add apps/miniapp && git commit -m "feat(miniapp): shell, home, event list, guests, create and schedule"`

---

### Task 13: Мини-апп — составы

**Files:**
- Create: `apps/miniapp/src/screens/Teams.tsx`
- Modify: `apps/miniapp/src/screens/Event.tsx` (вкладка `teams`)
- Test: `apps/miniapp/test/Teams.test.tsx`

**Interfaces:**
- Consumes: `balanceTeams`, `alternativeSplit`, `teamCountFor`, `TEAMS` (Task 2); `PUT /teams`, `POST /teams/publish` (Task 10); `EventDetailDto.teams`, `SignupDto.level`.

Поведение: игрок видит опубликованные команды (или «Составы ещё не опубликованы»). Организатор: чипы «2»/«3» (по умолчанию `teams?.teamCount ?? teamCountFor(main.length)`), «Поделить» (`balanceTeams` по `level`; у гостя — `guestLevel ?? 5`), «Ещё вариант» (`alternativeSplit`), сумма уровней под каждой командой, обмен: тап по игроку → выделен → тап по игроку другой команды → обмен; если размеры команд разные — тап по заголовку команды переносит выделенного. У гостя — выбор уровня 1–10 (только для этого сбора). «Сохранить и опубликовать» → `PUT` и `POST publish`. Если `teams.stale` — плашка «Состав изменился — пересобери команды».

- [ ] **Step 1: Тесты**

```ts
test('organizer splits 10 players into 2 teams of 5 with visible sums', async () => { /* click 'Поделить' → two team blocks with 5 names each; sums rendered */ });
test('tap two players from different teams swaps them', async () => { /* … names moved */ });
test('publish sends PUT then POST', async () => { /* api.send calls order: PUT /api/events/5/teams, POST /api/events/5/teams/publish */ });
test('player sees published teams without levels', async () => { /* role player; no element with level numbers / 'Сила' */ });
test('stale banner', async () => { /* teams.stale true → text 'Состав изменился' */ });
```

- [ ] **Step 2:** `pnpm --filter @sbor/miniapp test -- Teams` → FAIL.
- [ ] **Step 3: Реализовать** `Teams.tsx`.
- [ ] **Step 4:** `pnpm --filter @sbor/miniapp test` → PASS.
- [ ] **Step 5: Commit** `git add apps/miniapp && git commit -m "feat(miniapp): team split and publish"`

---

### Task 14: Мини-апп — счёт и оплата

**Files:**
- Create: `apps/miniapp/src/screens/Bill.tsx`, `apps/miniapp/src/kaspi.ts`
- Modify: `apps/miniapp/src/screens/Event.tsx` (вкладка `bill`)
- Test: `apps/miniapp/test/Bill.test.tsx`

**Interfaces:**
- Consumes: `computeBill`, `formatTenge`, `formatKzPhone`, `normalizeKzPhone` (Task 3); маршруты счёта (Task 11); `copy`, `openLink`, `haptic` (Task 12).
- Produces: `kaspi.ts`: `KASPI_OPEN_URL = 'https://kaspi.kz/'`; `transfer(phone: string): Promise<void>` — копирует номер, `haptic('success')`, `openLink(KASPI_OPEN_URL)`.

Поведение:
- **Игрок** (счёт есть): «С тебя 2 000 ₸» крупно (если `underpaid` — «Доплатить 500 ₸»), получатель и номер, кнопки «Перевести» (`transfer`), «Скопировать сумму», «Я скинул» (`POST /api/bills/:id/paid`). Нет счёта — «Счёт ещё не выставлен».
- **Организатор, создание/правка:** получатель (по умолчанию сам; список — основа), номер Kaspi (если у получателя пусто), «Аренда поля», строки допрасходов (добавить/удалить), участники — чекбоксы (по умолчанию вся основа, резерв свёрнут ниже), живой расчёт «По N ₸ с человека» через `computeBill`, «Выставить счёт» → `PUT /api/events/:id/bill`. Ошибки `no_kaspi`/`bad_phone` показываются у поля номера.
- **Организатор/получатель, после выставления:** строки с состоянием и переключателем оплаты (`POST /api/bill-lines/:id`), «Напомнить должникам» (двухшагово), «Закрыть счёт», «Изменить».

- [ ] **Step 1: Тесты**

```ts
test('live share preview rounds up to 50', async () => { /* 12 participants, аренда 20000 → text 'По 1 700 ₸' (с NBSP) */ });
test('unchecking a participant updates preview', async () => { /* 10 → 9 participants, 20000 → 'По 2 250 ₸' */ });
test('bad phone error shows next to the field', async () => { /* api.send rejects ApiError(400,'bad_phone') → text 'Проверь номер' */ });
test('player: transfer copies phone and opens Kaspi; "Я скинул" posts paid', async () => { /* tg.copy called with '+77071234567'; openLink 'https://kaspi.kz/'; api.send('POST','/api/bills/3/paid') */ });
test('underpaid shows due amount', async () => { /* line state underpaid due 500 → 'Доплатить 500 ₸' */ });
```

- [ ] **Step 2:** `pnpm --filter @sbor/miniapp test -- Bill` → FAIL.
- [ ] **Step 3: Реализовать** `Bill.tsx`, `kaspi.ts`.
- [ ] **Step 4:** `pnpm --filter @sbor/miniapp test` → PASS.
- [ ] **Step 5: Commit** `git add apps/miniapp && git commit -m "feat(miniapp): bill creation and payments"`

---

### Task 15: Мини-апп — игроки и профиль

**Files:**
- Create: `apps/miniapp/src/screens/Players.tsx`, `apps/miniapp/src/screens/Profile.tsx`
- Test: `apps/miniapp/test/{Players,Profile}.test.tsx`

**Interfaces:**
- Consumes: `GET/PATCH /api/members`, `GET/PATCH /api/me` (Task 9); `normalizeKzPhone`, `formatKzPhone` (Task 3).

Поведение: **Players** (org+) — список: имя, роль, уровень. Для админа тап → шторка: уровень (чипы 1–10), роль («Организатор» / «Игрок»), отображаемое имя → `PATCH`. Организатор видит, но не редактирует. **Profile** — отображаемое имя, номер Kaspi (подсказка «нужен, если ты платишь за поле»), «Сохранить»; номер проверяется `normalizeKzPhone` до отправки.

- [ ] **Step 1: Тесты**

```ts
test('admin sets level 8', async () => { /* role admin; tap player → chip '8' → api.send('PATCH','/api/members/12',{level:8}) */ });
test('organizer sees levels but no edit sheet', async () => { /* role organizer; tap → no chips */ });
test('profile rejects junk phone before sending', async () => { /* type 'abc' → 'Проверь номер', api.send not called */ });
```

- [ ] **Step 2:** `pnpm --filter @sbor/miniapp test -- Players Profile` → FAIL.
- [ ] **Step 3: Реализовать.**
- [ ] **Step 4:** `pnpm -r test && pnpm -r typecheck` → PASS во всех пакетах.
- [ ] **Step 5: Commit** `git add apps/miniapp && git commit -m "feat(miniapp): players and profile"`

---

### Task 16: Деплой и проверка в Telegram

**Files:**
- Create: `README.md` (команды разработки, деплоя, переменные), `apps/worker/scripts/set-webhook.sh`
- Modify: корневой `package.json` (скрипт `deploy`: `pnpm --filter @sbor/miniapp build && pnpm --filter @sbor/worker exec wrangler deploy`)

Требует действий владельца (аккаунт Cloudflare, @BotFather, Telegram ID). Сначала всё проверяется в **тестовой** группе.

- [ ] **Step 1: Бот.** В @BotFather: `/newbot` → токен; `/setprivacy` → Enable; `/newapp` → привязать Mini App к боту, short name = `MINIAPP_SHORT_NAME`, URL — адрес воркера (после первого деплоя). Telegram ID владельца — через @userinfobot → `ADMIN_TG_ID`.
- [ ] **Step 2: Cloudflare.** `wrangler login`; `wrangler d1 create sbor` → id в `wrangler.jsonc`; `wrangler d1 migrations apply sbor --remote`; `wrangler secret put BOT_TOKEN`; `wrangler secret put WEBHOOK_SECRET` (случайные 32+ символа); `vars` в `wrangler.jsonc`.
- [ ] **Step 3: Деплой.** `pnpm deploy` → URL `https://<worker>.workers.dev`; `GET /api/health` → `{"ok":true}`.
- [ ] **Step 4: Вебхук.** `set-webhook.sh` вызывает `setWebhook` с `url=<worker>/tg/webhook`, `secret_token`, `allowed_updates=["message","callback_query"]`; `getWebhookInfo` → без `last_error_message`. Кнопка меню бота — URL мини-аппа (`setChatMenuButton` или BotFather).
- [ ] **Step 5: Привязка.** Добавить бота в тестовую группу админом (право закреплять), написать `/bind` → «Группа привязана ✅».
- [ ] **Step 6: Ручная проверка (тестовая группа, минимум 3 аккаунта, iOS и Android):**
  - создать сбор в мини-аппе → в группе одно закреплённое сообщение;
  - 11 нажатий «Иду» → 10 в основе, 1 в резерве; быстрые нажатия с трёх аккаунтов → сообщение догоняет за несколько секунд;
  - «Не иду» из основы → резервист в основе + одно уведомление с отметкой; «Иду» в течение 2 минут → прежнее место;
  - «+ Друг» → открывается мини-апп на форме гостя;
  - назначить 2 часа → 11–15 переходят в основу, одно уведомление; вернуть 1 час → обратно;
  - поделить и опубликовать составы → одно сообщение; повторная публикация редактирует его;
  - выставить счёт → сообщение; **проверить, что кнопка `copy_text` работает в группе** (если нет — заменить её на URL-кнопку `b<id>` и записать в README);
  - «Перевести» в мини-аппе → номер скопирован; **проверить, открывается ли приложение Kaspi по `KASPI_OPEN_URL` на iOS и Android**; если найдётся ссылка, которая открывает экран перевода, — обновить `KASPI_OPEN_URL` и записать в README; иначе оставить как есть;
  - «Я скинул» → галочка; последний оплативший → счёт закрыт;
  - тёмная тема Telegram → мини-апп читаемый.
- [ ] **Step 7:** Повторить Steps 4–5 для основной группы (`/bind` в ней).
- [ ] **Step 8: Commit** `git add README.md apps/worker/scripts package.json apps/worker/wrangler.jsonc && git commit -m "chore: deploy scripts and README"`
