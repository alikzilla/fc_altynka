import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export async function loadTelegramEnv() {
  const values = {};
  for (const relative of ['../../apps/worker/.dev.vars', '../../apps/worker/.webhook.env']) {
    try { Object.assign(values, parseEnv(await readFile(new URL(relative, import.meta.url), 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read the local Telegram configuration.'); }
  }
  return { ...values, ...process.env };
}

const methods = {
  get_bot: ['getMe', 'Read the bot identity and supported Telegram capabilities.'],
  get_webhook: ['getWebhookInfo', 'Read webhook URL, pending updates and delivery errors. Does not consume updates.'],
  get_commands: ['getMyCommands', 'Read the bot commands for the default scope.'],
  get_menu_button: ['getChatMenuButton', 'Read the default menu button and Mini App URL.'],
};

export function createTelegramServer({ token, webhookSecret, fetcher = fetch } = {}) {
  const server = new McpServer({ name: 'fc-altynka-telegram', version: '1.0.0' });
  for (const [name, [method, description]] of Object.entries(methods)) {
    server.registerTool(name, {
      description, inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async () => {
      if (!token) return { isError: true, content: [{ type: 'text', text: 'BOT_TOKEN is missing. Set it in apps/worker/.webhook.env or in the process environment.' }] };
      try {
        const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', signal: AbortSignal.timeout(15_000) });
        const data = await response.json();
        // Never forward transport errors: their messages can contain the secret request URL.
        if (!response.ok || !data.ok) return { isError: true, content: [{ type: 'text', text: `Telegram ${method} failed (HTTP ${response.status}). Check the token and network access.` }] };
        let output = JSON.stringify(data.result, null, 2);
        for (const secret of [token, webhookSecret].filter(Boolean)) output = output.replaceAll(secret, '[REDACTED]');
        return { content: [{ type: 'text', text: output }] };
      } catch {
        return { isError: true, content: [{ type: 'text', text: `Telegram ${method} is unreachable. Check network access and retry.` }] };
      }
    });
  }
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  try {
    const env = await loadTelegramEnv();
    await createTelegramServer({ token: env.BOT_TOKEN, webhookSecret: env.WEBHOOK_SECRET }).connect(new StdioServerTransport());
  } catch {
    console.error('Telegram MCP could not start. Check local configuration and dependencies.');
    process.exitCode = 1;
  }
}
