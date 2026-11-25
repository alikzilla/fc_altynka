import { escapeHtml } from '@altynka/core';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth/middleware';
import { opsState } from '../db/schema';
import { activeMemberships } from '../domain/members';
import { makeTgClient } from '../telegram/client';
import { body } from './validate';

/** Не чаще одного сообщения в 30 секунд от человека: лимит на запись (60 в минуту) слишком щедр для лички админа. */
export const FEEDBACK_INTERVAL_MS = 30_000;

const report = z.object({
  text: z.string().trim().min(1).max(1000),
  path: z.string().max(200),
  version: z.string().max(40),
});

/**
 * «Сообщить о проблеме»: текст человека с тем, кто он, из каких групп, с какого экрана и какой версии, сразу
 * уходит в личку `FEEDBACK_CHAT_ID`. Ссылка на автора позволяет ответить ему напрямую.
 */
export const feedbackApi = new Hono<AppEnv>();

feedbackApi.post('/feedback', body(report), async c => {
  const chatId = Number(c.env.FEEDBACK_CHAT_ID) || null;
  if (!chatId) return c.json({ error: 'feedback_off' }, 503);
  const { db, now } = c.get('deps');
  const user = c.get('user');
  const key = `feedback.last.${user.id}`;
  const last = Number((await db.select().from(opsState).where(eq(opsState.key, key)))[0]?.value ?? 0);
  if (now - last < FEEDBACK_INTERVAL_MS) return c.json({ error: 'too_often' }, 429);

  const r = c.req.valid('json');
  const telegram = c.get('telegram');
  const groups = (await activeMemberships(db, c.env, user)).map(m => m.community.title);
  const who = [telegram.firstName, telegram.lastName].filter(Boolean).join(' ');
  const html = [
    '📝 <b>Сообщение о проблеме</b>',
    `От: <a href="tg://user?id=${user.tgId}">${escapeHtml(who)}</a>${telegram.username ? ` (@${escapeHtml(telegram.username)})` : ''}, в приложении «${escapeHtml(user.displayName)}», id ${user.id}`,
    `Группы: ${groups.length ? groups.map(escapeHtml).join(', ') : 'нет'}`,
    `Экран: <code>${escapeHtml(r.path)}</code> · версия <code>${escapeHtml(r.version)}</code>`,
    '',
    `<blockquote>${escapeHtml(r.text)}</blockquote>`,
  ].join('\n');
  try {
    await makeTgClient(c.env).sendMessage(chatId, html);
  } catch (e) {
    console.error(JSON.stringify({ event: 'feedback_not_sent', userId: user.id, error: String(e) }));
    return c.json({ error: 'not_sent' }, 503);
  }
  await db.insert(opsState).values({ key, value: String(now) }).onConflictDoUpdate({ target: opsState.key, set: { value: String(now) } });
  return c.json({ sent: true });
});
