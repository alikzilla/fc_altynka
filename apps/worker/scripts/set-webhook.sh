#!/usr/bin/env bash
# Привязывает вебхук и кнопку меню бота к задеплоенному Worker'у.
# Использование: BOT_TOKEN=... WEBHOOK_SECRET=... WORKER_URL=https://fc-altynka.<you>.workers.dev ./scripts/set-webhook.sh
set -euo pipefail
: "${BOT_TOKEN:?нужен BOT_TOKEN}"
: "${WEBHOOK_SECRET:?нужен WEBHOOK_SECRET}"
: "${WORKER_URL:?нужен WORKER_URL}"

api="https://api.telegram.org/bot${BOT_TOKEN}"

curl -sS "${api}/setWebhook" \
  --data-urlencode "url=${WORKER_URL}/tg/webhook" \
  --data-urlencode "secret_token=${WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message","callback_query"]'
echo

curl -sS "${api}/setChatMenuButton" -H 'content-type: application/json' \
  -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Открыть\",\"web_app\":{\"url\":\"${WORKER_URL}\"}}}"
echo

curl -sS "${api}/getWebhookInfo"
echo
