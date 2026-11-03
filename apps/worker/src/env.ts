import type { EventSync } from './sync/EventSync';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  EVENT_SYNC: DurableObjectNamespace<EventSync>;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  BOT_USERNAME: string;
  MINIAPP_SHORT_NAME: string;
  ADMIN_TG_ID: string;
}
