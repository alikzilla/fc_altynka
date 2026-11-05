import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';

/** zod-валидация тела с единым ответом 400 {error:'invalid'}. */
export const body = <T extends ZodType>(schema: T) =>
  zValidator('json', schema, (r, c) => {
    if (!r.success) return c.json({ error: 'invalid' }, 400);
  });

export const idParam = (raw: string): number | null => (/^\d+$/.test(raw) ? Number(raw) : null);

/** Результат домена → HTTP-код. */
export function statusFor(kind: string): 200 | 403 | 404 | 409 {
  if (kind === 'not_found') return 404;
  if (kind === 'forbidden') return 403;
  if (kind === 'closed' || kind === 'not_scheduled' || kind === 'not_started' || kind === 'past_start' || kind === 'stale') return 409;
  return 200;
}
