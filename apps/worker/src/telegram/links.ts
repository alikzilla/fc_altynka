import { escapeHtml } from '@altynka/core';
import type { Env } from '../env';

export type LinkEnv = Pick<Env, 'BOT_USERNAME' | 'MINIAPP_SHORT_NAME'>;

/** Прямая ссылка на мини-апп; web_app-кнопки в группах Telegram запрещает. */
export function miniAppLink(env: LinkEnv, param?: string): string {
  const base = `https://t.me/${env.BOT_USERNAME}/${env.MINIAPP_SHORT_NAME}`;
  return param ? `${base}?startapp=${param}` : base;
}

/** Отметка, которая работает и без username. */
export function mention(tgId: number, name: string): string {
  return `<a href="tg://user?id=${tgId}">${escapeHtml(name)}</a>`;
}
