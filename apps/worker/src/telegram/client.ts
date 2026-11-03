import { Api, GrammyError } from 'grammy';
import type { InlineKeyboardMarkup } from 'grammy/types';
import type { Env } from '../env';

export interface TgClient {
  sendMessage(chatId: number, html: string, o?: { replyTo?: number; keyboard?: InlineKeyboardMarkup }): Promise<{ messageId: number }>;
  editMessage(chatId: number, messageId: number, html: string, keyboard?: InlineKeyboardMarkup): Promise<void>;
  pinMessage(chatId: number, messageId: number): Promise<void>;
  isMember(chatId: number, tgUserId: number): Promise<boolean>;
}

export class TgRateLimited extends Error {
  constructor(public retryAfterSec: number) {
    super(`telegram rate limit, retry after ${retryAfterSec}s`);
  }
}

/** Сообщение, которое пытались отредактировать, удалено из чата. */
export class TgMessageGone extends Error {}

function translate(e: unknown): never {
  if (e instanceof GrammyError) {
    if (e.error_code === 429) throw new TgRateLimited(e.parameters.retry_after ?? 5);
    if (/message to edit not found|MESSAGE_ID_INVALID/i.test(e.description)) throw new TgMessageGone(e.description);
  }
  throw e;
}

const isNotModified = (e: unknown) => e instanceof GrammyError && /message is not modified/i.test(e.description);

class GrammyTgClient implements TgClient {
  private api: Api;
  constructor(token: string) {
    this.api = new Api(token);
  }
  async sendMessage(chatId: number, html: string, o: { replyTo?: number; keyboard?: InlineKeyboardMarkup } = {}) {
    try {
      const m = await this.api.sendMessage(chatId, html, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: o.keyboard,
        reply_parameters: o.replyTo ? { message_id: o.replyTo, allow_sending_without_reply: true } : undefined,
      });
      return { messageId: m.message_id };
    } catch (e) {
      translate(e);
    }
  }
  async editMessage(chatId: number, messageId: number, html: string, keyboard?: InlineKeyboardMarkup) {
    try {
      await this.api.editMessageText(chatId, messageId, html, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      });
    } catch (e) {
      if (isNotModified(e)) return;
      translate(e);
    }
  }
  async pinMessage(chatId: number, messageId: number) {
    try {
      await this.api.pinChatMessage(chatId, messageId, { disable_notification: true });
    } catch {
      // нет прав на закрепление — просто не закрепляем
    }
  }
  async isMember(chatId: number, tgUserId: number) {
    try {
      const m = await this.api.getChatMember(chatId, tgUserId);
      return m.status === 'creator' || m.status === 'administrator' || m.status === 'member' || (m.status === 'restricted' && m.is_member);
    } catch {
      return false;
    }
  }
}

let override: TgClient | null = null;

export function __setTgClientForTests(c: TgClient | null): void {
  override = c;
}

export function makeTgClient(env: Pick<Env, 'BOT_TOKEN'>): TgClient {
  return override ?? new GrammyTgClient(env.BOT_TOKEN);
}
