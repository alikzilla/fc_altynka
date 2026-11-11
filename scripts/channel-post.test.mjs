import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgs, runChannelPost, validatePost } from './channel-post.mjs';

const post = '<b>Запись прямо в боте</b>\nТеперь «Иду» работает в личном чате.';
const stdin = text => ({ readStdin: async () => text });
const never = { loadEnv: () => { throw new Error('must not load secrets'); }, fetcher: () => { throw new Error('must not fetch'); } };

test('default dry run validates and prints the post without credentials or network', async () => {
  const logs = [];
  const plan = await runChannelPost({ argv: ['-', '--button', 'Открыть приложение|https://t.me/fc_altynka_bot/fc_altynka_app'], log: t => logs.push(t), ...stdin(post), ...never });
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.channel, '@fc_altynka_news');
  assert.equal(plan.method, 'sendMessage');
  assert.deepEqual(plan.buttons, [{ text: 'Открыть приложение', url: 'https://t.me/fc_altynka_bot/fc_altynka_app' }]);
  assert.match(logs.join('\n'), /dry-run/);
});

test('--apply sends HTML to the news channel and reports the public link', async () => {
  const calls = [];
  const result = await runChannelPost({ argv: ['-', '--apply', '--silent', '--pin', '--button', 'Открыть|https://t.me/fc_altynka_bot'], log: () => {}, ...stdin(post),
    loadEnv: async () => ({ BOT_TOKEN: 'test-secret' }), fetcher: async (url, options) => {
      calls.push({ url, payload: JSON.parse(options.body) });
      return Response.json({ ok: true, result: { message_id: 42, chat: { username: 'fc_altynka_news' } } });
    } });
  assert.deepEqual(calls.map(c => c.url.split('/').at(-1)), ['sendMessage', 'pinChatMessage']);
  assert.deepEqual(calls[0].payload, { chat_id: '@fc_altynka_news', parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Открыть', url: 'https://t.me/fc_altynka_bot' }]] },
    text: post, link_preview_options: { is_disabled: false }, disable_notification: true });
  assert.deepEqual(result, { mode: 'published', channel: '@fc_altynka_news', message_id: 42, link: 'https://t.me/fc_altynka_news/42', pinned: true });
});

test('a local photo is uploaded as multipart with the post as its caption; --edit rewrites an existing post', async () => {
  const calls = [];
  const fetcher = async (url, options) => { calls.push({ method: url.split('/').at(-1), body: options.body }); return Response.json({ ok: true, result: { message_id: 7 } }); };
  const loadEnv = async () => ({ BOT_TOKEN: 'test-secret' });
  await runChannelPost({ argv: ['-', '--apply', '--photo', 'shot.png'], log: () => {}, ...stdin(post), loadEnv, fetcher, readPhoto: async () => Buffer.from('png') });
  assert.equal(calls[0].method, 'sendPhoto');
  assert.equal(calls[0].body.get('caption'), post);
  assert.equal(calls[0].body.get('photo').name, 'shot.png');
  const edited = await runChannelPost({ argv: ['-', '--apply', '--edit', '7'], log: () => {}, ...stdin(post), loadEnv, fetcher });
  assert.equal(calls[1].method, 'editMessageText');
  assert.equal(JSON.parse(calls[1].body).message_id, 7);
  assert.equal(edited.link, 'https://t.me/fc_altynka_news/7');
});

test('a document goes out as sendDocument with the post as its caption', async () => {
  const calls = [];
  const fetcher = async (url, options) => { calls.push({ method: url.split('/').at(-1), body: options.body }); return Response.json({ ok: true, result: { message_id: 8 } }); };
  const argv = ['-', '--document', 'docs/news.pdf', '--button', 'Открыть|https://t.me/fc_altynka_bot'];
  const plan = await runChannelPost({ argv, log: () => {}, ...stdin(post), readPhoto: async () => Buffer.from('%PDF') });
  assert.equal(plan.method, 'sendDocument');
  assert.equal(plan.limit, 1024);
  await runChannelPost({ argv: [...argv, '--apply'], log: () => {}, ...stdin(post), loadEnv: async () => ({ BOT_TOKEN: 'test-secret' }), fetcher, readPhoto: async () => Buffer.from('%PDF') });
  assert.equal(calls[0].method, 'sendDocument');
  assert.equal(calls[0].body.get('document').name, 'news.pdf');
  assert.equal(calls[0].body.get('document').type, 'application/pdf');
  assert.equal(calls[0].body.get('caption'), post);
  assert.throws(() => parseArgs(['p.html', '--photo', 'a.png', '--document', 'b.pdf']), /either --photo or --document/);
});

test('broken drafts fail before anything is sent', async () => {
  assert.throws(() => validatePost('  '), /empty/);
  assert.throws(() => validatePost('<h1>Заголовок</h1>'), /does not support <h1>/);
  assert.throws(() => validatePost('<b>жирный'), /not closed/);
  assert.throws(() => validatePost('<b><i>текст</b></i>'), /closed in order/);
  assert.throws(() => validatePost('3 < 5'), /&lt;/);
  assert.throws(() => validatePost('Матчи & оплата'), /&amp;/);
  assert.throws(() => validatePost('<a href="javascript:alert(1)">x</a>'), /link must look like/);
  assert.throws(() => validatePost('я'.repeat(1025), { caption: true }), /limit for a photo caption is 1024/);
  assert.equal(validatePost('<b>Счёт</b> 3 &lt; 5 &amp; <a href="https://t.me/fc_altynka_bot">бот</a>').length, 'Счёт 3 < 5 & бот'.length);
  await assert.rejects(runChannelPost({ argv: ['-', '--apply'], ...stdin('<h1>x</h1>'), ...never }), /does not support/);
});

test('arguments are checked before credentials are read', async () => {
  assert.throws(() => parseArgs([]), /Usage/);
  assert.throws(() => parseArgs(['a.html', '--webhook']), /Unexpected argument/);
  assert.throws(() => parseArgs(['a.html', '--button', 'нет ссылки']), /--button expects/);
  assert.throws(() => parseArgs(['a.html', '--channel', 'fc_altynka_news']), /@username/);
  assert.throws(() => parseArgs(['a.html', '--edit', '5', '--pin']), /--edit changes/);
  await assert.rejects(runChannelPost({ argv: ['-', '--apply'], ...stdin(post), loadEnv: async () => ({}), fetcher: never.fetcher }), /BOT_TOKEN is missing/);
});

test('errors explain the Telegram rejection and never disclose the token', async () => {
  for (const fetcher of [
    async () => { throw new Error('https://api.telegram.org/botprivate-token/sendMessage'); },
    async () => Response.json({ ok: false, error_code: 403, description: 'Forbidden: bot private-token is not a member of the channel chat' }, { status: 403 }),
  ]) {
    await assert.rejects(runChannelPost({ argv: ['-', '--apply'], log: () => {}, ...stdin(post), loadEnv: async () => ({ BOT_TOKEN: 'private-token' }), fetcher }),
      error => /Telegram sendMessage failed/.test(error.message) && !error.message.includes('private-token'));
  }
  await assert.rejects(runChannelPost({ argv: ['-', '--apply'], log: () => {}, ...stdin(post), loadEnv: async () => ({ BOT_TOKEN: 'private-token' }),
    fetcher: async () => Response.json({ ok: false, description: 'Bad Request: chat not found' }, { status: 400 }) }), /HTTP 400: Bad Request: chat not found/);
});
