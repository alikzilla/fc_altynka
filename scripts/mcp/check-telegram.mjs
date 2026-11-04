import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadTelegramEnv } from './telegram.mjs';

const client = new Client({ name: 'altynka-diagnostics', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./telegram.mjs', import.meta.url))] }));
  const { tools } = await client.listTools();
  const result = {};
  for (const tool of tools) {
    const response = await client.callTool({ name: tool.name, arguments: {} });
    if (response.isError) throw new Error(response.content[0].text);
    result[tool.name] = JSON.parse(response.content[0].text);
  }
  const health = result.get_webhook.url ? await fetch(new URL('/api/health', result.get_webhook.url), { signal: AbortSignal.timeout(15_000) }).then(async response => ({ status: response.status, ok: (await response.json()).ok === true })) : null;
  const env = await loadTelegramEnv();
  const readSetting = async (method, payload = {}) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
      const value = await response.json();
      if (!response.ok || !value.ok) throw new Error('rejected');
      return value.result;
    } catch { throw new Error(`Telegram ${method} verification failed.`); }
  };
  const [privateCommands, groupCommands, description] = await Promise.all([
    readSetting('getMyCommands', { scope: { type: 'all_private_chats' } }),
    readSetting('getMyCommands', { scope: { type: 'all_group_chats' } }),
    readSetting('getMyShortDescription'),
  ]);
  console.log(JSON.stringify({
    tools: tools.length, bot: result.get_bot.username, botName: result.get_bot.first_name,
    webhookConfigured: !!result.get_webhook.url,
    pendingUpdates: result.get_webhook.pending_update_count,
    lastWebhookError: result.get_webhook.last_error_message ?? null,
    lastWebhookErrorAt: result.get_webhook.last_error_date ? new Date(result.get_webhook.last_error_date * 1000).toISOString() : null,
    commandCount: result.get_commands.length,
    privateCommands: privateCommands.map(c => c.command),
    groupCommands: groupCommands.map(c => c.command),
    shortDescription: description.short_description,
    menuButton: result.get_menu_button.type,
    menuUrl: result.get_menu_button.web_app?.url ?? null,
    workerHealth: health,
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await client.close(); }
