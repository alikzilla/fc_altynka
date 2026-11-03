import type { InlineKeyboardMarkup } from 'grammy/types';
import type { TgClient } from '../../src/telegram/client';

export class FakeTg implements TgClient {
  sent: { chatId: number; html: string; replyTo?: number; keyboard?: InlineKeyboardMarkup; messageId: number }[] = [];
  edited: { chatId: number; messageId: number; html: string; keyboard?: InlineKeyboardMarkup }[] = [];
  pinned: { chatId: number; messageId: number }[] = [];
  members = new Set<number>();
  failNextWith?: Error;
  private nextId = 500;

  private maybeFail() {
    const e = this.failNextWith;
    if (e) {
      this.failNextWith = undefined;
      throw e;
    }
  }
  async sendMessage(chatId: number, html: string, o: { replyTo?: number; keyboard?: InlineKeyboardMarkup } = {}) {
    this.maybeFail();
    const messageId = this.nextId++;
    this.sent.push({ chatId, html, replyTo: o.replyTo, keyboard: o.keyboard, messageId });
    return { messageId };
  }
  async editMessage(chatId: number, messageId: number, html: string, keyboard?: InlineKeyboardMarkup) {
    this.maybeFail();
    this.edited.push({ chatId, messageId, html, keyboard });
  }
  async pinMessage(chatId: number, messageId: number) {
    this.pinned.push({ chatId, messageId });
  }
  async isMember(_chatId: number, tgUserId: number) {
    return this.members.has(tgUserId);
  }
}
