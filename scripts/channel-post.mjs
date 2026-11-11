import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTelegramEnv } from './mcp/telegram.mjs';

export const NEWS_CHANNEL = '@fc_altynka_news';
const TEXT_LIMIT = 4096;
const CAPTION_LIMIT = 1024;
/** Telegram HTML: everything else must be escaped as &lt; &gt; &amp;. */
const TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'pre', 'blockquote', 'tg-spoiler']);
const USAGE = 'Usage: node scripts/channel-post.mjs <file|-> [--apply] [--channel @name] [--photo <file|https url>] [--document <file>] [--album <image>]… [--button "Текст|https://…"]… [--silent] [--no-preview] [--pin] [--edit <message_id> [--caption]]';

export function parseArgs(argv) {
  const o = { source: null, apply: false, channel: null, photo: null, document: null, album: [], buttons: [], silent: false, preview: true, pin: false, edit: null, caption: false };
  const flags = { '--apply': 'apply', '--silent': 'silent', '--pin': 'pin', '--caption': 'caption' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => { if (argv[i + 1] === undefined) throw new Error(`${arg} needs a value.\n${USAGE}`); return argv[++i]; };
    if (arg in flags) o[flags[arg]] = true;
    else if (arg === '--no-preview') o.preview = false;
    else if (arg === '--channel') o.channel = value();
    else if (arg === '--photo') o.photo = value();
    else if (arg === '--document') o.document = value();
    else if (arg === '--album') o.album.push(value());
    else if (arg === '--edit') o.edit = value();
    else if (arg === '--button') {
      const raw = value();
      const cut = raw.indexOf('|');
      const button = { text: raw.slice(0, cut).trim(), url: raw.slice(cut + 1).trim() };
      if (cut < 1 || !button.text || !/^(https:\/\/|tg:\/\/)\S+$/.test(button.url)) throw new Error('--button expects "Текст|https://…".');
      o.buttons.push(button);
    } else if (arg.startsWith('--') || o.source !== null) throw new Error(`Unexpected argument ${arg}.\n${USAGE}`);
    else o.source = arg;
  }
  if (o.source === null) throw new Error(USAGE);
  if (o.channel !== null && !/^(@[A-Za-z][A-Za-z0-9_]{3,31}|-100\d+)$/.test(o.channel)) throw new Error('--channel expects @username or a -100… chat id.');
  if (o.edit !== null && !/^[1-9]\d*$/.test(o.edit)) throw new Error('--edit expects a message id.');
  if (o.photo && o.document) throw new Error('Use either --photo or --document.');
  if (o.album.length && (o.photo || o.document)) throw new Error('--album cannot be combined with --photo or --document.');
  if (o.album.length === 1 || o.album.length > 10) throw new Error('--album needs 2 to 10 images; use --photo for one.');
  if (o.album.some(f => /^https?:\/\//.test(f))) throw new Error('--album expects local files.');
  if (o.album.length && o.buttons.length) throw new Error('Telegram does not allow buttons under an album; put the link into the text.');
  if (o.document && /^https?:\/\//.test(o.document)) throw new Error('--document expects a local file.');
  if (o.edit !== null && (o.photo || o.document || o.album.length || o.pin || o.silent)) throw new Error('--edit changes text (or, with --caption, a photo or file caption) and buttons only.');
  if (o.caption && o.edit === null) throw new Error('--caption is only used with --edit.');
  return o;
}

/** Checks the post the way Telegram would, so a broken draft fails in the dry run and not in the channel. */
export function validatePost(html, { caption = false } = {}) {
  const text = html.trim();
  if (!text) throw new Error('The post is empty.');
  const open = [];
  const rest = text.replace(/<(\/?)([a-zA-Z][\w-]*)((?:\s[^<>]*)?)>/g, (_all, closing, name, attrs) => {
    const tag = name.toLowerCase();
    if (!TAGS.has(tag)) throw new Error(`Telegram does not support <${name}>. Allowed: ${[...TAGS].join(', ')}.`);
    if (closing) {
      if (open.pop() !== tag) throw new Error(`Unexpected </${name}>: tags must be closed in order.`);
    } else {
      if (tag === 'a' && !/^\shref="(https?:\/\/|tg:\/\/)[^"\s]+"$/.test(attrs)) throw new Error('A link must look like <a href="https://…">text</a>.');
      if (tag !== 'a' && attrs.trim() && !(tag === 'blockquote' && attrs.trim() === 'expandable') && !(tag === 'code' && /^\sclass="language-[\w-]+"$/.test(attrs))) throw new Error(`<${name}> must not have attributes.`);
      open.push(tag);
    }
    return '';
  });
  if (open.length) throw new Error(`<${open.at(-1)}> is not closed.`);
  if (/[<>]/.test(rest)) throw new Error('A bare < or > must be written as &lt; or &gt;.');
  if (/&(?!(?:lt|gt|amp|quot|#\d+|#x[\da-f]+);)/i.test(rest)) throw new Error('A bare & must be written as &amp;.');
  const length = [...rest.replace(/&(?:lt|gt|amp|quot|#\d+|#x[\da-f]+);/gi, 'x')].length;
  const limit = caption ? CAPTION_LIMIT : TEXT_LIMIT;
  if (length > limit) throw new Error(`The post is ${length} characters; the limit ${caption ? 'for a photo caption ' : ''}is ${limit}.`);
  return { text, length, limit };
}

async function readSource(source, readStdin) {
  if (source === '-') return readStdin();
  try { return await readFile(source, 'utf8'); }
  catch { throw new Error(`Cannot read ${source}.`); }
}

async function stdinText() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

/** Dry run needs no credentials and sends nothing. --apply publishes exactly what the dry run showed. */
export async function runChannelPost({ argv = [], loadEnv = loadTelegramEnv, fetcher = fetch, log = console.log, readStdin = stdinText, readPhoto = readFile } = {}) {
  const o = parseArgs(argv);
  const asCaption = o.edit !== null ? o.caption : !!(o.photo || o.document || o.album.length);
  const { text, length, limit } = validatePost(await readSource(o.source, readStdin), { caption: asCaption });
  // A document (a PDF, for example) is always a local file and goes out the same way as a local photo.
  const attachment = o.document ?? o.photo;
  const localPhoto = !!o.document || (o.photo && !/^https:\/\//.test(o.photo));
  const photoBytes = localPhoto ? await Promise.resolve(readPhoto(attachment)).catch(() => { throw new Error(`Cannot read ${attachment}.`); }) : null;
  const albumBytes = [];
  for (const file of o.album) albumBytes.push(await Promise.resolve(readPhoto(file)).catch(() => { throw new Error(`Cannot read ${file}.`); }));
  const method = o.edit !== null ? (o.caption ? 'editMessageCaption' : 'editMessageText') : o.album.length ? 'sendMediaGroup' : o.document ? 'sendDocument' : o.photo ? 'sendPhoto' : 'sendMessage';
  const markup = o.buttons.length ? { inline_keyboard: o.buttons.map(b => [b]) } : undefined;
  const plan = { channel: o.channel ?? NEWS_CHANNEL, method, length, limit, ...(o.photo ? { photo: o.photo } : {}), ...(o.document ? { document: o.document, bytes: photoBytes.length } : {}), ...(o.album.length ? { album: o.album } : {}), ...(o.edit ? { message_id: Number(o.edit) } : {}), buttons: o.buttons, silent: o.silent, pin: o.pin, text };
  if (!o.apply) {
    log(JSON.stringify({ mode: 'dry-run', ...plan }, null, 2));
    return { mode: 'dry-run', ...plan };
  }

  let env;
  try { env = await loadEnv(); }
  catch { throw new Error('Cannot read local Telegram configuration.'); }
  const token = env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is missing. Set it in apps/worker/.webhook.env or in the process environment.');
  const chat = o.channel ?? env.NEWS_CHANNEL ?? NEWS_CHANNEL;
  const call = async (name, payload, form) => {
    let reason = 'network error';
    try {
      const response = await fetcher(`https://api.telegram.org/bot${token}/${name}`, form
        ? { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) }
        : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
      const result = await response.json();
      // The description says what to fix (unknown chat, no rights, bad markup); the token never leaves this process.
      reason = `HTTP ${response.status}: ${String(result.description ?? 'no description').replaceAll(token, '[REDACTED]')}`;
      if (!response.ok || !result.ok) throw new Error('rejected');
      return result.result;
    } catch (error) {
      if (error?.name === 'TimeoutError') reason = 'request timed out';
      // A code such as ENOTFOUND or SELF_SIGNED_CERT_IN_CHAIN tells a blocked host from an untrusted proxy certificate.
      else if (reason === 'network error' && /^[A-Z0-9_]+$/.test(String(error?.cause?.code ?? ''))) reason = `network error: ${error.cause.code}`;
      throw new Error(`Telegram ${name} failed (${reason}).`);
    }
  };

  const common = { chat_id: chat, parse_mode: 'HTML', ...(markup ? { reply_markup: markup } : {}) };
  let message;
  if (method === 'editMessageText') message = await call(method, { ...common, message_id: Number(o.edit), text, link_preview_options: { is_disabled: !o.preview } });
  else if (method === 'editMessageCaption') message = await call(method, { ...common, message_id: Number(o.edit), caption: text });
  else if (method === 'sendMessage') message = await call(method, { ...common, text, link_preview_options: { is_disabled: !o.preview }, disable_notification: o.silent });
  else if (method === 'sendMediaGroup') {
    // The caption sits on the first image, so the album reads as one post.
    const form = new FormData();
    form.set('chat_id', chat);
    if (o.silent) form.set('disable_notification', 'true');
    form.set('media', JSON.stringify(o.album.map((_file, i) => ({ type: 'photo', media: `attach://p${i}`, ...(i === 0 ? { caption: text, parse_mode: 'HTML' } : {}) }))));
    o.album.forEach((file, i) => form.set(`p${i}`, new Blob([albumBytes[i]]), basename(file)));
    [message] = await call(method, null, form);
  }
  else if (!localPhoto) message = await call(method, { ...common, photo: o.photo, caption: text, disable_notification: o.silent });
  else {
    const form = new FormData();
    form.set('chat_id', chat); form.set('parse_mode', 'HTML'); form.set('caption', text);
    if (o.silent) form.set('disable_notification', 'true');
    if (markup) form.set('reply_markup', JSON.stringify(markup));
    form.set(o.document ? 'document' : 'photo', new Blob([photoBytes], o.document?.toLowerCase().endsWith('.pdf') ? { type: 'application/pdf' } : {}), basename(attachment));
    message = await call(method, null, form);
  }
  const messageId = message?.message_id ?? Number(o.edit);
  let pinned = false;
  if (o.pin) { await call('pinChatMessage', { chat_id: chat, message_id: messageId, disable_notification: true }); pinned = true; }
  const username = message?.chat?.username ?? (chat.startsWith('@') ? chat.slice(1) : null);
  const result = { mode: o.edit !== null ? 'edited' : 'published', channel: chat, message_id: messageId, ...(username ? { link: `https://t.me/${username}/${messageId}` } : {}), pinned };
  log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))) {
  try { await runChannelPost({ argv: process.argv.slice(2) }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
