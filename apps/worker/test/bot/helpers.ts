import { env } from 'cloudflare:test';
import type { Update, UserFromGetMe } from 'grammy/types';
import { createBot } from '../../src/bot/bot';
import { FakeSync } from '../fakes/fakeSync';
import { db } from '../helpers';

export const botInfo: UserFromGetMe = {
  id: 999, is_bot: true, first_name: 'Сбор', username: 'sbor_bot', can_join_groups: true,
  can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false,
  has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false,
} as UserFromGetMe;

export function makeTestBot(now = () => Date.now()) {
  const sync = new FakeSync();
  const bot = createBot(env, { db: db(), sync, now }, botInfo);
  const calls: { method: string; payload: Record<string, unknown> }[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { ok: true, result: true } as never;
  });
  const answers = () => calls.filter(c => c.method === 'answerCallbackQuery').map(c => c.payload.text);
  return { bot, sync, calls, answers };
}

let uid = 1;
/** Нажатие кнопки под сообщением бота в группе chatId (по умолчанию — привязанной в seedCommunity). */
export const tap = (fromId: number, data: string, firstName = 'Арман', chatId = -100500): Update => ({
  update_id: uid++,
  callback_query: {
    id: `q${uid}`, from: { id: fromId, is_bot: false, first_name: firstName }, chat_instance: 'ci', data,
    message: { message_id: 1, date: 0, chat: { id: chatId, type: 'supergroup', title: 'Футбол' } } as never,
  },
});

export const migrated = (fromChatId: number, toChatId: number): Update => ({
  update_id: uid++,
  message: { message_id: uid, date: 0, chat: { id: fromChatId, type: 'group', title: 'Футбол' }, migrate_to_chat_id: toChatId } as never,
});

export const groupCommand = (fromId: number, text: string): Update => ({
  update_id: uid++,
  message: {
    message_id: uid, date: 0, text,
    chat: { id: -100777, type: 'supergroup', title: 'Футбол' },
    from: { id: fromId, is_bot: false, first_name: 'Кто-то' },
    entities: [{ type: 'bot_command', offset: 0, length: text.length }],
  },
});

export const privateCommand = (fromId: number, text: string): Update => ({
  update_id: uid++,
  message: {
    message_id: uid, date: 0, text,
    chat: { id: fromId, type: 'private', first_name: 'Кто-то' },
    from: { id: fromId, is_bot: false, first_name: 'Кто-то' },
    entities: [{ type: 'bot_command', offset: 0, length: text.length }],
  },
});
