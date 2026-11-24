import { webhookCallback } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { Hono } from 'hono';
import { api } from './api/routes';
import { createBot } from './bot/bot';
import { getDb } from './db/client';
import type { Env } from './env';
import { doSyncPort } from './sync/port';
import { recoverPendingGameReviews } from './domain/gameRecovery';
import { sendAvailabilityReminders } from './domain/availabilityReminder';
import { makeTgClient, TgRateLimited } from './telegram/client';
import { sameSecret } from './auth/secret';
import { checkAlerts, cronIsStale, makeOpsTelegram, markCronRan, recordIncident } from './ops/alerts';

export { EventSync } from './sync/EventSync';

const app = new Hono<{ Bindings: Env }>();

/** One shape for every unexpected failure: a JSON body for the mini app and a structured log line. */
app.onError(async (err, c) => {
  const path = new URL(c.req.url).pathname;
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ event: 'unhandled_error', method: c.req.method, path, error: message }));
  // Telegram asked to wait while checking membership: tell the client when to retry instead of a bare 500.
  if (err instanceof TgRateLimited) return c.json({ error: 'telegram_busy' }, 503, { 'Retry-After': String(err.retryAfterSec) });
  await recordIncident(getDb(c.env.DB), 'api_error', `${c.req.method} ${path}: ${message}`, Date.now());
  return c.json({ error: 'internal' }, 500);
});

// For an external uptime monitor: 503 when the database is unreachable or the cron stopped running.
app.get('/api/health', async c => {
  try {
    if (await cronIsStale(getDb(c.env.DB), Date.now())) return c.json({ ok: false, error: 'cron_stale' }, 503);
  } catch {
    return c.json({ ok: false, error: 'db_unavailable' }, 503);
  }
  return c.json({ ok: true });
});
app.route('/api', api);

let cachedBotInfo: UserFromGetMe | undefined;

app.post('/tg/webhook', async c => {
  if (!(await sameSecret(c.req.header('X-Telegram-Bot-Api-Secret-Token'), c.env.WEBHOOK_SECRET))) return c.text('unauthorized', 401);
  const bot = createBot(c.env, { db: getDb(c.env.DB), sync: doSyncPort(c.env), now: () => Date.now() }, cachedBotInfo);
  if (!cachedBotInfo) {
    await bot.init();
    cachedBotInfo = bot.botInfo;
  }
  return webhookCallback(bot, 'hono', { secretToken: c.env.WEBHOOK_SECRET })(c);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller, env) {
    const db = getDb(env.DB);
    const now = Date.now();
    // Каждая задача отдельно: сбой одной не останавливает остальные и попадает в алерт.
    const task = async (name: string, run: () => Promise<void>) => {
      try { await run(); }
      catch (e) {
        console.error(JSON.stringify({ event: name, error: String(e) }));
        await recordIncident(db, 'cron_failed', `${name}: ${String(e)}`, now);
      }
    };
    await task('game_review_recovery', async () => {
      const result = await recoverPendingGameReviews({ db, now, sync: doSyncPort(env) });
      if (result.failed) {
        console.error(JSON.stringify({ event: 'game_review_recovery', ...result }));
        await recordIncident(db, 'cron_failed', `game_review_recovery: ${result.failed} не восстановлено`, now);
      }
    });
    await task('availability_reminder', async () => { await sendAvailabilityReminders({ db, now, tg: makeTgClient(env), env }); });
    await task('cron_heartbeat', () => markCronRan(db, now));
    // Последней: сбои задач выше попадают в эту же сводку.
    try { await checkAlerts({ db, now, tg: makeOpsTelegram(env), chatId: Number(env.ALERT_CHAT_ID) || null }); }
    catch (e) { console.error(JSON.stringify({ event: 'alert_check_failed', error: String(e) })); }
  },
} satisfies ExportedHandler<Env>;
