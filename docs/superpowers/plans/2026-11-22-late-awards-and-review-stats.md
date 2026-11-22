# Поздние награды и результативность в опросе — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** вернуть награды в прод, дать уже ответившим выбрать награды, показать голы и пасы в опросе.

**Architecture:** слияние `origin/main` в `main`; отдельный `POST /events/:id/review/awards`, который
дописывает `awards`/`awardsSkipped` в сохранённый ответ и вставляет `award_votes` одним пакетом;
статистика участника из протокола игр в `MatchReviewDto`; автозакрытие ждёт шага наград.

**Tech Stack:** Hono + Drizzle/D1 (Worker), React 19 (мини-апп), vitest.

**Spec:** `docs/superpowers/specs/2026-11-22-late-awards-and-review-stats-design.md`

## Global Constraints

- Тексты интерфейса и сообщений — по-русски.
- Отправленные оценки не меняются; награды отправляются один раз.
- Без новых миграций: `award_votes` и триггер уже в проде (0018).
- Личное сообщение уходит только после утверждения текста пользователем.

## Review Focus

- Участник, пропустивший весь опрос (`skipped`), не видит карточку наград и считается ответившим.
- Повторная отправка тех же наград — `ok`, другие награды — `conflict` (409).
- Награды после закрытия опроса — 409; голос за себя или не участника — 400.
- Матч без записанных игр: строки статистики нет, опрос работает как раньше.
- Автозакрытие: последний ответивший без шага наград не закрывает опрос, пока у других нет наград.

---

### Task 1: Слияние `origin/main`

- [ ] `git merge origin/main`; конфликты в `DESIGN.md`, `MatchReview.tsx`, `MatchRatings.tsx`,
  `domain/ratings.ts` разрешить, сохранив обе стороны (награды + досрочное закрытие, `voted`, `canClose`).
- [ ] `pnpm typecheck && pnpm test` — зелёные. Коммит слияния.

### Task 2: Worker — поздние награды, статистика, автозакрытие

**Files:** `packages/core/src/ratings.ts`, `apps/worker/src/domain/ratings.ts`, `apps/worker/src/api/ratings.ts`,
`apps/worker/test/api/ratings.test.ts`

**Interfaces (Produces):**
- `ReviewInput.awardsSkipped?: true`
- `MatchReviewDto.canAddAwards?: boolean`
- `MatchReviewDto.participants[].stats?: ReviewPlayerStats` где
  `ReviewPlayerStats = { games; goals; assists; wins; draws; losses; assistsTracked }` (core).
- `submitReviewAwards(d, ev, userId, input: { awards?: AwardPicks; skipped?: boolean }): Promise<'ok'|'invalid'|'closed'|'conflict'|'forbidden'>`
- `POST /events/:id/review/awards` body `{ awards?: AwardPicks, skipped?: boolean }` → `MatchReviewDto`.

- [ ] Тесты: ответ без наград → `canAddAwards: true`; `POST …/awards` с выбором → `award_votes` строки,
  `ownSubmission.awards`, `canAddAwards: false`; повтор того же → 200, другое → 409; `skipped: true` →
  `awardsSkipped`; закрытый опрос → 409; за себя → 400; пропуск всего опроса → `canAddAwards: false`;
  `stats` у участников при записанных играх; автозакрытие не срабатывает, пока у ответившего нет шага наград,
  и срабатывает после `POST …/awards`.
- [ ] Реализация. В `submitReview` новый ответ с выбором или с `awardsSkipped` (мини-апп пропустил все
  награды) хранит соответствующее поле. Условие полноты в `closeReview` и `voted` для организатора:
  ответ есть и (`skipped` = 1 или в payload есть `awards` или `awardsSkipped`).
- [ ] `pnpm --filter @altynka/worker exec vitest run test/api/ratings.test.ts` зелёный, коммит.

### Task 3: Мини-апп — карточка наград и статистика

**Files:** `apps/miniapp/src/screens/MatchReview.tsx`, `ReviewRater.tsx`, `components/AwardPicker.tsx`,
`styles/ratings.css`, `apps/miniapp/test/Ratings.test.tsx`

- [ ] `ReviewRater` получает `mode?: 'full' | 'awards'`; в режиме `awards` только шаги наград, последняя
  кнопка «Отправить награды», можно отправить и без выбора (тогда `skipped`).
- [ ] Полный опрос: если наград не выбрано, отправляет `awardsSkipped: true`.
- [ ] Экран «Спасибо» при `canAddAwards` — карточка «Выбери лучших игроков матча» с кнопкой.
- [ ] Строка статистики под именем в шаге игрока и в строках `AwardPicker`: «3 гола · 2 паса · 6 игр · 4В 1Н 1П»
  (пасы — только при `assistsTracked`).
- [ ] Тесты Testing Library на карточку, отправку `…/awards` и строку статистики; `pnpm test`, `pnpm typecheck`, коммит.

### Task 4: Выпуск

- [ ] `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:ui`.
- [ ] `git push origin main`; `pnpm run deploy`; запись `docs/late-awards-deployment.md`.
- [ ] Пробный прогон рассылки (список получателей по событию 12 + текст) → утверждение → отправка.
