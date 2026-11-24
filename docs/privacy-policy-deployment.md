# Политика конфиденциальности, staging и `pnpm release` — 24 ноября 2026

По запросу пользователя PR #28 (staging), #29 (`pnpm release`) и #30 (политика конфиденциальности) слиты в `main`.
Первый production-релиз через `pnpm release`.

## Выпуск

- Адрес: https://fc-altynka.nuspekovalihan.workers.dev
- Исходники: `main`, слияние `47a645f`; CI: https://github.com/alikzilla/fc_altynka/actions/runs/45459897053
- Staging перед продом: `pnpm release --staging`, версия `96ff33ed-60f7-4b85-8647-0335620074c9`.
- Предыдущая версия: `690a8178-1f42-4036-b945-8c2cc582030a`.
- Опубликованная версия: `6996de9e-6d40-485c-b7aa-37a5a17cd1a9`, 100% трафика.
- Миграций нет. Откат: `wrangler rollback 690a8178-1f42-4036-b945-8c2cc582030a`.
- Отчёт: `artifacts/deploy/releases/production-2026-11-24T18-36-03-749Z.json`.

## Что вошло

- Политика конфиденциальности: `/privacy` (Cloudflare перенаправляет `/privacy.html` → `/privacy`), ссылка в профиле
  («Системные настройки»).
- Код Worker не менялся: staging и `pnpm release` — конфигурация и скрипты.

## Проверки

- `pnpm release`: main чистый и совпадает с origin, CI зелёный, health ok, вебхук без ошибок.
- `/privacy.html` → 307 → `/privacy` → 200 с production CSP.

## Осталось сделать вручную

- @BotFather: вписать `https://fc-altynka.nuspekovalihan.workers.dev/privacy` в настройку политики конфиденциальности бота.
