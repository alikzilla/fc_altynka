export const BOT_USERNAME: string = import.meta.env.VITE_BOT_USERNAME ?? 'fc_altynka_bot';
export const connectGroupLink = `https://t.me/${BOT_USERNAME}?startgroup=connect&admin=pin_messages`;
const MINIAPP_SHORT_NAME: string = import.meta.env.VITE_MINIAPP_SHORT_NAME ?? 'fc_altynka_app';
/** Direct link that opens the mini app on a match (same format as the bot's links in the group). */
export const matchLink = (eventId: number) => `https://t.me/${BOT_USERNAME}/${MINIAPP_SHORT_NAME}?startapp=e${eventId}`;
