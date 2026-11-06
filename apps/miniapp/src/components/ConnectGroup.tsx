import { connectGroupLink } from '../lib/bot';
import { openTelegramLink } from '../lib/tg';
import { Icon } from './Icon';

export const CONNECT_BOT_TEXT = 'Добавь бота в Telegram-группу, где играете, и сделай его администратором с правом закреплять сообщения. Когда бот будет подключён, обнови приложение, и группа появится в списке.';

export function ConnectGroupButton() {
  return <button className="btn primary wide" type="button" onClick={() => openTelegramLink(connectGroupLink)}>Добавить в группу<Icon name="plus" /></button>;
}
