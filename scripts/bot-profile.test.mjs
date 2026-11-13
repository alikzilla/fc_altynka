import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBotProfile } from './bot-profile.mjs';

test('default dry run shows the public configuration without reading credentials or calling Telegram', async () => {
  const logs = [];
  const config = await runBotProfile({ log: text => logs.push(text), loadEnv: () => { throw new Error('must not load secrets'); }, fetcher: () => { throw new Error('must not fetch'); } });
  assert.equal(config.find(c => c.method === 'setMyName').payload.name, 'ФК Алтынка');
  assert.match(logs.join('\n'), /dry-run/);
  const scopes = config.filter(c => c.method === 'setMyCommands');
  assert.deepEqual(scopes.map(c => c.payload.scope.type), ['all_private_chats', 'all_group_chats']);
  assert.deepEqual(scopes[1].payload.commands.map(c => c.command), ['matches', 'help']);
  assert.equal(scopes[0].payload.commands.some(c => c.command === 'newmatch'), false);
  assert.equal(config.find(c => c.method === 'setChatMenuButton').payload.menu_button.text, 'Открыть');
  assert.equal(config.find(c => c.method === 'setChatMenuButton').payload.menu_button.web_app.url, 'https://t.me/fc_altynka_bot/fc_altynka_app');
  assert.deepEqual(config.map(c => c.method), ['setMyName', 'setMyShortDescription', 'setMyDescription', 'setMyCommands', 'setMyCommands', 'setChatMenuButton']);
});

test('--apply with only credentials keeps the actual project Mini App target', async () => {
  const calls = [];
  await runBotProfile({ argv: ['--apply'], log: () => {}, loadEnv: async () => ({ BOT_TOKEN: 'test-secret' }), fetcher: async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({ ok: true, result: true });
  } });
  assert.equal(calls.at(-1).menu_button.web_app.url, 'https://t.me/fc_altynka_bot/fc_altynka_app');
});

test('--apply only changes approved metadata with JSON payloads and the configured app URL', async () => {
  const calls = [];
  await runBotProfile({ argv: ['--apply'], log: () => {}, loadEnv: async () => ({ BOT_TOKEN: 'test-secret', BOT_USERNAME: 'club_bot', MINIAPP_SHORT_NAME: 'club' }), fetcher: async (url, options) => {
    calls.push({ method: url.split('/').at(-1), payload: JSON.parse(options.body) });
    return Response.json({ ok: true, result: true });
  } });
  assert.equal(calls.length, 6);
  assert.deepEqual(calls.at(-1).payload.menu_button, { type: 'web_app', text: 'Открыть', web_app: { url: 'https://t.me/club_bot/club' } });
  assert.equal(calls.some(c => /webhook|photo/i.test(c.method)), false);
});

test('errors never disclose credentials from transport or Telegram descriptions', async () => {
  for (const fetcher of [async () => { throw new Error('https://api.telegram.org/botprivate-token/setMyName'); }, async () => Response.json({ ok: false, description: 'private-token' }, { status: 400 })]) {
    const logs = [];
    await assert.rejects(runBotProfile({ argv: ['--apply'], log: t => logs.push(t), loadEnv: async () => ({ BOT_TOKEN: 'private-token' }), fetcher }), error => !error.message.includes('private-token'));
    assert.doesNotMatch(logs.join('\n'), /private-token/);
  }
});

test('unsupported arguments fail before credentials are read', async () => {
  await assert.rejects(runBotProfile({ argv: ['--webhook'], loadEnv: () => { throw new Error('secrets read'); } }), /Only --apply/);
});

test('a rejected metadata request reports HTTP and Telegram code without credentials', async () => {
  await assert.rejects(runBotProfile({ argv: ['--apply'], log: () => {}, loadEnv: async () => ({ BOT_TOKEN: 'private-token' }), fetcher: async () => Response.json({ ok: false, error_code: 400, description: 'private-token' }, { status: 400 }) }), /HTTP 400, Telegram 400/);
});
