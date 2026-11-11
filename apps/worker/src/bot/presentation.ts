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
/** Канал с новостями проекта. */
export const NEWS_URL = 'https://t.me/fc_altynka_news';
export const helpText = [
  '<b>Как пользоваться</b>',
  '• Записаться: /matches и «Иду» под нужным матчем. Если основа заполнена, ты попадёшь в резерв; освободится место — бот напишет.',
  '• Оплата: после матча придёт счёт. Переведи за поле и отметь оплату в /payments.',
  '• Уведомления о новых матчах, составах и оплате: /settings.',
  '• Новости проекта: @fc_altynka_news.',
  '',
  'По вопросам матча обратись к организатору в группе.',
].join('\n');
/** Строка «Меню» под любым экраном, кроме главного. */
export const menuRow = [{ text: '‹ Меню', callback_data: 'm:home' }];
export const appKeyboard = (env: LinkEnv, text: string, param: string): InlineKeyboardMarkup => ({
  inline_keyboard: [[{ text, url: miniAppLink(env, param) }]],
});
export const mainKeyboard = (env: LinkEnv): InlineKeyboardMarkup => ({
  inline_keyboard: [[{ text: 'Открыть приложение', url: miniAppLink(env) }]],
});
export function settingsText(enabled: boolean, available: boolean): string {
  return [
    '<b>Уведомления</b>',
    `Личные уведомления: ${enabled ? 'включены' : 'выключены'}.`,
    `Доставка в личный чат: ${available ? 'доступна' : 'недоступна'}.`,
    '',
    enabled ? 'Бот пишет лично, когда:' : 'Если включить, бот напишет лично, когда:',
    '• открыта запись на новый матч',
    '• назначены или изменились время и поле, матч отменён',
    '• ты перешёл из резерва в основу или обратно',
    '• готовы составы',
    '• до матча два часа',
    '• после матча: твои голы и новые достижения',
    '• выставлен счёт или пора оплатить',
    '• можно оценить игру',
  ].join('\n');
}
export const settingsKeyboard = (env: LinkEnv, enabled: boolean): InlineKeyboardMarkup => ({
  inline_keyboard: [
    [{ text: enabled ? 'Выключить уведомления' : 'Включить уведомления', callback_data: `notify:${enabled ? '0' : '1'}` }],
    [{ text: 'Открыть профиль', url: miniAppLink(env, 'settings') }],
    menuRow,
  ],
});

type JoinAnswer = { kind: 'main' | 'reserve'; position: number; restored: boolean } | { kind: 'already'; position: number; inMain: boolean } | { kind: 'closed' | 'not_found' };
/** Текст всплывашки после «Иду» — один для группы и личного чата. */
export function joinAnswer(r: JoinAnswer): string {
  switch (r.kind) {
    case 'main': return `${r.restored ? 'Ты снова в основе' : 'Ты в основе'} · место ${r.position}`;
    case 'reserve': return `${r.restored ? 'Ты снова в резерве' : 'Ты в резерве'} · место ${r.position}`;
    case 'already': return `Ты уже ${r.inMain ? 'в основе' : 'в резерве'} · место ${r.position}`;
    case 'closed': return 'Запись на этот матч закрыта';
    case 'not_found': return 'Матч не найден';
  }
}
export function leaveAnswer(kind: 'left' | 'not_in' | 'closed' | 'not_found'): string {
  return { left: 'Запись отменена. В течение 2 минут можно вернуть прежнее место.', not_in: 'Тебя нет в списке', closed: 'Запись закрыта', not_found: 'Сбор не найден' }[kind];
}
