# FC Altynka — Telegram-бот + мини-апп

Бот ведёт сбор на игру одним самообновляющимся сообщением в группе: запись кнопкой «Иду», резерв, назначение времени,
составы и счёт. Мини-апп — для деталей, составов, счёта и админки.

- Дизайн: `docs/superpowers/specs/2026-11-03-football-sbor-bot-design.md`
- План: `docs/superpowers/plans/2026-11-03-football-sbor-bot.md`

## Структура

| Пакет | Что внутри |
|---|---|
| `packages/core` | Чистая логика: очередь и резерв, деление команд, счёт, форматирование, типы API |
| `apps/worker` | Cloudflare Worker: вебхук бота (grammY), API (Hono), D1 (Drizzle), Durable Object `EventSync` |
| `apps/miniapp` | Мини-апп на React + Vite; собирается в `apps/miniapp/dist` и раздаётся тем же Worker'ом |

## Разработка

```bash
pnpm install
pnpm test          # все тесты
pnpm typecheck     # проверка типов
pnpm build         # сборка мини-аппа
```

Локально: `cp apps/worker/.dev.vars.example apps/worker/.dev.vars`, затем
`cd apps/worker && pnpm exec wrangler d1 migrations apply fc-altynka --local && pnpm exec wrangler dev`.
Мини-апп в браузере: `pnpm --filter @altynka/miniapp dev` (проксирует `/api` на `localhost:8787`).
Без Telegram мини-апп покажет «Открой мини-апп из Telegram» — это нормально.

## Переменные

| Имя | Где | Что |
|---|---|---|
| `BOT_TOKEN` | секрет | токен бота от @BotFather |
| `WEBHOOK_SECRET` | секрет | случайная строка 32+ символа, ей подписываются вебхуки |
| `BOT_USERNAME` | `vars` в `wrangler.jsonc` | имя бота без `@` |
| `MINIAPP_SHORT_NAME` | `vars` | short name мини-аппа из `/newapp` |
| `ADMIN_TG_ID` | `vars` | Telegram ID админа (узнать у @userinfobot) |

## Деплой (сначала — в тестовой группе)

1. **Бот.** В @BotFather: `/newbot` → токен; `/setprivacy` → Enable.
2. **Cloudflare.**
   ```bash
   cd apps/worker
   pnpm exec wrangler login
   pnpm exec wrangler d1 create fc-altynka          # id вписать в wrangler.jsonc → d1_databases[0].database_id
   pnpm exec wrangler d1 migrations apply fc-altynka --remote
   pnpm exec wrangler secret put BOT_TOKEN
   pnpm exec wrangler secret put WEBHOOK_SECRET
   ```
   В `wrangler.jsonc` → `vars` вписать `BOT_USERNAME`, `MINIAPP_SHORT_NAME`, `ADMIN_TG_ID`.
3. **Деплой:** из корня `pnpm run deploy` (именно `run`: `pnpm deploy` — встроенная команда pnpm).
   Проверка: `https://<worker>.workers.dev/api/health` → `{"ok":true}`.
4. **Мини-апп.** В @BotFather: `/newapp` → выбрать бота, URL = адрес воркера, short name = `MINIAPP_SHORT_NAME`.
5. **Вебхук и кнопка меню.** Создать `apps/worker/.webhook.env` (он в `.gitignore`, в git не попадёт) с теми же
   значениями, что ушли в `wrangler secret put`:
   ```bash
   BOT_TOKEN='...'
   WEBHOOK_SECRET='...'
   WORKER_URL='https://<worker>.workers.dev'
   ```
   и запустить из корня `apps/worker/scripts/set-webhook.sh`. Токен и секрет не вписывать в сам скрипт.
   В выводе `getWebhookInfo` не должно быть `last_error_message`.
6. **Группа.** Добавить бота в группу админом (с правом закреплять сообщения) и написать в группе `/bind`
   от аккаунта `ADMIN_TG_ID` → «Группа привязана ✅».
7. **Переезд в основную группу.** Сначала в мини-аппе отменить тестовые сборы (или закрыть их счета) — пока они
   открыты, бот откажется переезжать. Затем добавить бота админом в основную группу и написать там `/bind`.
   После переезда каждый участник заново подтверждает членство: мини-апп сам спросит Telegram при следующем входе.
   Тестовые сборы останутся в истории; чтобы начать с чистого листа, вместо переезда создать новую базу D1 (шаг 2).
   Если группу превратят в супергруппу, бот сам перейдёт на новый чат — `/bind` не нужен.

## Ручная проверка (тестовая группа, 3+ аккаунта, iOS и Android)

- [ ] Создать сбор в мини-аппе → в группе одно закреплённое сообщение.
- [ ] 11 нажатий «Иду» → 10 в основе, 1 в резерве; быстрые нажатия с трёх аккаунтов → сообщение догоняет за несколько секунд.
- [ ] «Не иду» из основы → резервист в основе + одно уведомление с отметкой; «Иду» в течение 2 минут → прежнее место.
- [ ] «➕ Друг» → открывается мини-апп на форме гостя.
- [ ] Назначить 2 часа → 11–15 переходят в основу, одно уведомление; вернуть 1 час → обратно.
- [ ] Поделить и опубликовать составы → одно сообщение; повторная публикация редактирует его.
- [ ] Выставить счёт → сообщение. **Проверить, что кнопка «📋 Номер Kaspi» (`copy_text`) работает в группе.**
      Если нет — заменить её на URL-кнопку `startapp=b<id>` в `apps/worker/src/render/billMessage.ts` и отметить здесь.
- [ ] «Перевести» в мини-аппе → номер скопирован. **Проверить, открывается ли приложение Kaspi по `KASPI_OPEN_URL`**
      (`apps/miniapp/src/kaspi.ts`) на iOS и Android. Если найдётся ссылка, открывающая экран перевода, — обновить её здесь.
- [ ] «Я скинул» → галочка; последний оплативший → счёт закрыт.
- [ ] Тёмная тема Telegram → мини-апп читаемый.

Результаты проверки `copy_text` и Kaspi-ссылки: _пока не проверено_.
