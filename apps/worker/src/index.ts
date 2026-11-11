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
import { makeTgClient } from './telegram/client';

export { EventSync } from './sync/EventSync';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', c => c.json({ ok: true }));
app.route('/api', api);

let cachedBotInfo: UserFromGetMe | undefined;

app.post('/tg/webhook', async c => {
  if (c.req.header('X-Telegram-Bot-Api-Secret-Token') !== c.env.WEBHOOK_SECRET) return c.text('unauthorized', 401);
  const bot = createBot(c.env, { db: getDb(c.env.DB), sync: doSyncPort(c.env), now: () => Date.now() }, cachedBotInfo);
  if (!cachedBotInfo) {
    await bot.init();
    cachedBotInfo = bot.botInfo;
  }
  return webhookCallback(bot, 'hono', { secretToken: c.env.WEBHOOK_SECRET })(c);
});

export default {
  fetch:app.fetch,
  async scheduled(_controller,env) {
    const result=await recoverPendingGameReviews({db:getDb(env.DB),now:Date.now(),sync:doSyncPort(env)});
    if(result.failed)console.error(JSON.stringify({event:'game_review_recovery',...result}));
    // Отдельно от восстановления оценок: сбой одного не останавливает другое.
    try { await sendAvailabilityReminders({ db: getDb(env.DB), now: Date.now(), tg: makeTgClient(env), env }); }
    catch (e) { console.error(JSON.stringify({ event: 'availability_reminder', error: String(e) })); }
  },
} satisfies ExportedHandler<Env>;
