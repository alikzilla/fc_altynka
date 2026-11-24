import { opsIncidents } from '../../src/db/schema';
import { ALERT_INTERVAL_MS, CRON_STALE_MS, checkAlerts, cronIsStale, markCronRan, PENDING_UPDATES_LIMIT, recordIncident, type OpsTelegram, type WebhookHealth } from '../../src/ops/alerts';
import { apiRequest, db } from '../helpers';

const ADMIN = 42;
// 2026-11-24 14:00 по Алматы.
const T0 = Date.parse('2026-11-24T09:00:00Z');

class FakeOps implements OpsTelegram {
  sent: { chatId: number; html: string }[] = [];
  webhook: WebhookHealth = { pending: 0 };
  failSend = false;
  failWebhook = false;
  async send(chatId: number, html: string) {
    if (this.failSend) throw new Error('telegram down');
    this.sent.push({ chatId, html });
  }
  async webhookInfo() {
    if (this.failWebhook) throw new Error('telegram down');
    return this.webhook;
  }
}

let tg: FakeOps;
beforeEach(() => { tg = new FakeOps(); });
const run = (now: number, chatId: number | null = ADMIN) => checkAlerts({ db: db(), now, tg, chatId });

test('silence while nothing failed', async () => {
  expect(await run(T0)).toEqual({ sent: false, incidents: 0 });
  expect(tg.sent).toEqual([]);
});

test('new failures arrive as one summary grouped by source, with the latest detail', async () => {
  await recordIncident(db(), 'api_error', 'GET /api/me: D1 down', T0 - 120_000);
  await recordIncident(db(), 'api_error', 'POST /api/events/7/join: <timeout>', T0 - 60_000);
  await recordIncident(db(), 'bot_update_failed', 'D1 down', T0 - 30_000);
  expect(await run(T0)).toEqual({ sent: true, incidents: 3 });
  expect(tg.sent).toHaveLength(1);
  const { chatId, html } = tg.sent[0];
  expect(chatId).toBe(ADMIN);
  expect(html).toContain('<b>API</b> × 2. Последняя: <code>POST /api/events/7/join: &lt;timeout&gt;</code>');
  expect(html).toContain('<b>Бот</b> × 1. Последняя: <code>D1 down</code>');
  expect(html).toContain('13:58');
  expect(html).toContain('13:59');
});

test('at most one summary per interval; failures in between wait for the next one and are not repeated', async () => {
  await recordIncident(db(), 'api_error', 'first', T0);
  await run(T0);
  await recordIncident(db(), 'cron_failed', 'availability_reminder: boom', T0 + 60_000);
  expect((await run(T0 + 5 * 60_000)).sent).toBe(false);
  expect((await run(T0 + ALERT_INTERVAL_MS)).sent).toBe(true);
  expect(tg.sent).toHaveLength(2);
  expect(tg.sent[1].html).toContain('<b>Крон</b> × 1');
  expect(tg.sent[1].html).not.toContain('first');
  // Nothing new — nothing sent, even after the interval.
  expect((await run(T0 + 3 * ALERT_INTERVAL_MS)).sent).toBe(false);
});

test('a summary that Telegram did not accept is retried on the next run', async () => {
  await recordIncident(db(), 'api_error', 'boom', T0);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  tg.failSend = true;
  expect(await run(T0)).toEqual({ sent: false, incidents: 1 });
  tg.failSend = false;
  expect(await run(T0 + 5 * 60_000)).toEqual({ sent: true, incidents: 1 });
});

test('a new webhook error reported by Telegram is alerted once', async () => {
  tg.webhook = { pending: 0, lastErrorDate: Math.floor(T0 / 1000) - 60, lastErrorMessage: 'Wrong response from the webhook: 500 Internal Server Error' };
  expect((await run(T0)).sent).toBe(true);
  expect(tg.sent[0].html).toContain('<b>Вебхук</b>: Telegram получил ошибку');
  expect(tg.sent[0].html).toContain('500 Internal Server Error');
  expect((await run(T0 + ALERT_INTERVAL_MS)).sent).toBe(false);
});

test('a webhook error older than a day is not news', async () => {
  tg.webhook = { pending: 0, lastErrorDate: Math.floor(T0 / 1000) - 2 * 86_400, lastErrorMessage: 'old' };
  expect((await run(T0)).sent).toBe(false);
});

test('a jammed webhook queue is alerted while it lasts, once per interval', async () => {
  tg.webhook = { pending: PENDING_UPDATES_LIMIT };
  expect((await run(T0)).sent).toBe(true);
  expect(tg.sent[0].html).toContain(`в очереди ${PENDING_UPDATES_LIMIT} необработанных обновлений`);
  expect((await run(T0 + 5 * 60_000)).sent).toBe(false);
  expect((await run(T0 + ALERT_INTERVAL_MS)).sent).toBe(true);
  tg.webhook = { pending: 3 };
  expect((await run(T0 + 2 * ALERT_INTERVAL_MS)).sent).toBe(false);
});

test('failures are still alerted when the webhook state cannot be read', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  tg.failWebhook = true;
  await recordIncident(db(), 'client_error', 'TypeError: x is undefined', T0);
  expect((await run(T0)).sent).toBe(true);
  expect(tg.sent[0].html).toContain('<b>Мини-апп</b> × 1');
});

test('without a recipient nothing is sent, and old records are cleaned up either way', async () => {
  await recordIncident(db(), 'api_error', 'old', T0 - 15 * 86_400_000);
  await recordIncident(db(), 'api_error', 'recent', T0);
  expect(await run(T0, null)).toEqual({ sent: false, incidents: 0 });
  expect(tg.sent).toEqual([]);
  expect((await db().select().from(opsIncidents)).map(i => i.detail)).toEqual(['recent']);
});

test('a long detail is cut so the summary fits one message', async () => {
  await recordIncident(db(), 'api_error', 'x'.repeat(5000), T0);
  const [row] = await db().select().from(opsIncidents);
  expect(row.detail).toHaveLength(300);
});

describe('health check', () => {
  test('a fresh install without cron runs is healthy', async () => {
    expect(await cronIsStale(db(), T0)).toBe(false);
  });

  test('the cron is stale once it has not run for a while', async () => {
    await markCronRan(db(), T0);
    expect(await cronIsStale(db(), T0 + CRON_STALE_MS)).toBe(false);
    expect(await cronIsStale(db(), T0 + CRON_STALE_MS + 1)).toBe(true);
  });

  test('/api/health answers 503 when the cron stopped', async () => {
    await markCronRan(db(), Date.now() - CRON_STALE_MS - 60_000);
    const r = await apiRequest('/api/health', { as: null });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ ok: false, error: 'cron_stale' });
    await markCronRan(db(), Date.now());
    expect((await apiRequest('/api/health', { as: null })).status).toBe(200);
  });
});

test('every cron run leaves a heartbeat for the health check', async () => {
  const { env } = await import('cloudflare:test');
  const worker = (await import('../../src/index')).default;
  await worker.scheduled({ cron: '*/5 * * * *', scheduledTime: Date.now(), noRetry() {} } as ScheduledController, env);
  expect(await cronIsStale(db(), Date.now() + CRON_STALE_MS - 60_000)).toBe(false);
  expect(await cronIsStale(db(), Date.now() + CRON_STALE_MS + 60_000)).toBe(true);
});
