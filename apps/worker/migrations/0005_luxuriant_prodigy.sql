ALTER TABLE `events` ADD `telegram_chat_id` integer;
--> statement-breakpoint
UPDATE events SET telegram_chat_id = (SELECT tg_chat_id FROM communities WHERE communities.id = events.community_id);
