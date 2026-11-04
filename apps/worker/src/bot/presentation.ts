import type { BotCommand, InlineKeyboardMarkup } from 'grammy/types';
import type { LinkEnv } from '../telegram/links';
import { miniAppLink } from '../telegram/links';

export const playerCommands: BotCommand[] = [
  { command: 'start', description: 'Открыть главное меню' },
  { command: 'matches', description: 'Предстоящие матчи' },
  { command: 'payments', description: 'Мои платежи' },
  { command: 'settings', description: 'Настроить уведомления' },
  { command: 'help', description: 'Как пользоваться' },
];
export const organizerCommands: BotCommand[] = [...playerCommands, { command: 'newmatch', description: 'Создать матч' }];
export const welcomeText = '<b>ФК Алтынка</b>\nМатчи, составы и оплата поля.\n\nОткрой матчи, чтобы записаться на игру.\nЛичные уведомления можно настроить отдельно.';
export const helpText = 'Открой /matches и нажми «Иду» под нужным матчем. Если основа заполнена, ты попадёшь в резерв.\n\nПосле перевода за поле отметь оплату в /payments. Уведомления — /settings. По вопросам матча обратись к организатору в группе.';
export const appKeyboard = (env: LinkEnv, text: string, param: string): InlineKeyboardMarkup => ({
  inline_keyboard: [[{ text, url: miniAppLink(env, param) }]],
});
export const mainKeyboard = (env: LinkEnv): InlineKeyboardMarkup => ({
  inline_keyboard: [[{ text: 'Открыть приложение', url: miniAppLink(env) }]],
});
export function settingsText(enabled: boolean, available: boolean): string {
  return `<b>Уведомления</b>\nЛичные уведомления: ${enabled ? 'включены' : 'выключены'}.\nДоставка в личный чат: ${available ? 'доступна' : 'недоступна'}.\n\nРазрешение Telegram и подписка на уведомления настраиваются отдельно.`;
}
export const settingsKeyboard = (env: LinkEnv, enabled: boolean): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: enabled ? 'Выключить уведомления' : 'Включить уведомления', callback_data: enabled ? 'notify:0' : 'notify:1' }],
    [{ text: 'Открыть профиль', url: miniAppLink(env, 'settings') }],
  ],
});
