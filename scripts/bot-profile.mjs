import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTelegramEnv } from './mcp/telegram.mjs';

const privateCommands = [
  { command: 'start', description: 'Открыть главное меню' },
  { command: 'matches', description: 'Предстоящие матчи' },
  { command: 'payments', description: 'Мои платежи' },
  { command: 'settings', description: 'Настроить уведомления' },
  { command: 'help', description: 'Как пользоваться' },
];

// Public defaults match apps/worker/wrangler.jsonc; credentials files need not repeat them.
export function botProfileConfig({ BOT_USERNAME = 'fc_altynka_bot', MINIAPP_SHORT_NAME = 'fc_altynka_app' } = {}) {
  return [
    { method: 'setMyName', payload: { name: 'ФК Алтынка' } },
    { method: 'setMyShortDescription', payload: { short_description: 'Матчи ФК Алтынка: запись, составы и оплата поля.' } },
    { method: 'setMyDescription', payload: { description: 'Здесь организуем футбол ФК Алтынка.\n\nЗаписывайся на матчи, следи за составами и отмечай оплату поля. Общие объявления — в группе команды. Личные уведомления можно подключить после запуска.\n\nНажми «Начать», чтобы открыть меню.' } },
    { method: 'setMyCommands', payload: { scope: { type: 'all_private_chats' }, commands: privateCommands } },
    { method: 'setMyCommands', payload: { scope: { type: 'all_group_chats' }, commands: privateCommands.filter(c => ['matches', 'help'].includes(c.command)) } },
    { method: 'setChatMenuButton', payload: { menu_button: { type: 'web_app', text: 'Открыть', web_app: { url: `https://t.me/${BOT_USERNAME}/${MINIAPP_SHORT_NAME}` } } } },
  ];
}

/** Dry run is credential-free. The only remote mutations are this fixed metadata allowlist. */
export async function runBotProfile({ argv = [], loadEnv = loadTelegramEnv, fetcher = fetch, log = console.log } = {}) {
  if (argv.some(arg => arg !== '--apply') || argv.length > 1) throw new Error('Only --apply is supported; omit it for a dry-run.');
  if (!argv.includes('--apply')) {
    const config = botProfileConfig();
    log(JSON.stringify({ mode: 'dry-run', config }, null, 2));
    return config;
  }
  let env;
  try { env = await loadEnv(); }
  catch { throw new Error('Cannot read local Telegram configuration.'); }
  if (!env.BOT_TOKEN) throw new Error('BOT_TOKEN is missing from the local Telegram configuration.');
  const config = botProfileConfig(env);
  for (const { method, payload } of config) {
    let reason = 'network error';
    try {
      const response = await fetcher(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json();
      reason = `HTTP ${response.status}, Telegram ${Number(result.error_code) || response.status}`;
      if (!response.ok || !result.ok) throw new Error('Telegram rejected metadata.');
    } catch (error) {
      // Request URLs and Telegram descriptions may contain credentials. Never forward them.
      if (error?.name === 'TimeoutError') reason = 'request timed out';
      throw new Error(`Telegram ${method} failed (${reason}). Check configuration and network access before retrying.`);
    }
  }
  log('Applied bot name, descriptions, scoped commands and menu button.');
  return config;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  try { await runBotProfile({ argv: process.argv.slice(2) }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
