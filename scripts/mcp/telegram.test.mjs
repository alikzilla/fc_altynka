import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createTelegramServer } from './telegram.mjs';

async function connect(options, fn) {
  const server = createTelegramServer(options);
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  try { await fn(client); } finally { await client.close(); await server.close(); }
}

test('exposes four read-only diagnostics and never calls getUpdates or mutation methods', async () => {
  const calls = [];
  await connect({ token: 'test-token', fetcher: async url => { calls.push(url); return Response.json({ ok: true, result: { username: 'test_bot' } }); } }, async client => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 4);
    for (const tool of tools) {
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal((await client.callTool({ name: tool.name, arguments: {} })).isError, undefined);
    }
    assert.deepEqual(calls.map(url => url.split('/').at(-1)).sort(), ['getChatMenuButton', 'getMe', 'getMyCommands', 'getWebhookInfo'].sort());
  });
});

test('missing credentials do not trigger network requests', async () => {
  await connect({ fetcher: () => { throw new Error('should not fetch'); } }, async client => {
    const result = await client.callTool({ name: 'get_bot' });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /BOT_TOKEN is missing/);
  });
});

test('transport errors and successful payloads never disclose credentials', async () => {
  for (const fetcher of [async () => { throw new Error('https://api.telegram.org/botsecret/getMe'); }, async () => Response.json({ ok: true, result: { url: 'secret/webhook-secret' } })]) {
    await connect({ token: 'secret', webhookSecret: 'webhook-secret', fetcher }, async client => {
      const result = await client.callTool({ name: 'get_bot' });
      assert.doesNotMatch(JSON.stringify(result), /secret/);
    });
  }
});
