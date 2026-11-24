#!/usr/bin/env bash
# Привязывает вебхук и кнопку меню бота к задеплоенному Worker'у.
# Значения берутся из apps/worker/.webhook.env (он в .gitignore) или из переменных окружения:
#   BOT_TOKEN='...'
#   WEBHOOK_SECRET='...'
#   WORKER_URL='https://fc-altynka.<you>.workers.dev'
# Запуск из корня: apps/worker/scripts/set-webhook.sh
# Staging: apps/worker/scripts/set-webhook.sh staging — значения из apps/worker/.webhook.staging.env.
set -euo pipefail
case "${1:-}" in
  '') env_file="$(dirname "$0")/../.webhook.env" ;;
  staging) env_file="$(dirname "$0")/../.webhook.staging.env"
    [ -f "$env_file" ] || { echo "нет $env_file" >&2; exit 1; } ;;
  *) echo "использование: $0 [staging]" >&2; exit 1 ;;
esac
# shellcheck disable=SC1090
[ -f "$env_file" ] && source "$env_file"
: "${BOT_TOKEN:?нужен BOT_TOKEN}"
: "${WEBHOOK_SECRET:?нужен WEBHOOK_SECRET}"
: "${WORKER_URL:?нужен WORKER_URL}"
WORKER_URL="${WORKER_URL%/}"

api="https://api.telegram.org/bot${BOT_TOKEN}"

curl -sS "${api}/setWebhook" \
  --data-urlencode "url=${WORKER_URL}/tg/webhook" \
  --data-urlencode "secret_token=${WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message","callback_query","chat_member","my_chat_member"]'
echo

curl -sS "${api}/setChatMenuButton" -H 'content-type: application/json' \
  -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Открыть\",\"web_app\":{\"url\":\"${WORKER_URL}\"}}}"
echo

curl -sS "${api}/getWebhookInfo"
echo
