import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth/middleware';
import { recordIncident } from '../ops/alerts';
import { body } from './validate';

const report = z.object({
  message: z.string().min(1).max(500),
  stack: z.string().max(4000).optional(),
  path: z.string().max(200),
  source: z.enum(['boundary', 'error', 'rejection']),
});

/**
 * Ошибки мини-аппа у игроков. Короткая строка уходит в сводку алертов, стек — только в логи Cloudflare.
 * Нужна подпись Telegram и действуют общие лимиты на человека, группа не нужна.
 */
export const clientErrorsApi = new Hono<AppEnv>();

clientErrorsApi.post('/client-errors', body(report), async c => {
  const { db, now } = c.get('deps');
  const r = c.req.valid('json');
  const userId = c.get('user').id;
  console.error(JSON.stringify({ event: 'client_error', userId, source: r.source, path: r.path, message: r.message, stack: r.stack }));
  await recordIncident(db, 'client_error', `${r.path}: ${r.message} (user ${userId})`, now);
  return c.body(null, 204);
});
