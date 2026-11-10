-- Лента новостей группы: короткие посты о сыгранных и предстоящих матчах.
CREATE TABLE `feed_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL REFERENCES `communities`(`id`),
	`event_id` integer NOT NULL REFERENCES `events`(`id`),
	`kind` text NOT NULL,
	`slot` text NOT NULL,
	`variant` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`text` text NOT NULL,
	`highlights_json` text DEFAULT '[]' NOT NULL,
	`user_id` integer REFERENCES `users`(`id`),
	`team_color` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feed_posts_event_slot` ON `feed_posts` (`event_id`,`slot`);
--> statement-breakpoint
CREATE INDEX `feed_posts_community_time` ON `feed_posts` (`community_id`,`created_at`);
--> statement-breakpoint
-- Реакция на пост: одна на человека. Ключ — матч и слот поста, поэтому реакции переживают переписывание поста.
CREATE TABLE `feed_reactions` (
	`event_id` integer NOT NULL REFERENCES `events`(`id`),
	`slot` text NOT NULL,
	`user_id` integer NOT NULL REFERENCES `users`(`id`),
	`reaction` text NOT NULL CHECK (`reaction` IN ('fire', 'good', 'bad')),
	`created_at` integer NOT NULL,
	PRIMARY KEY (`event_id`, `slot`, `user_id`)
);
--> statement-breakpoint
-- Пост, убранный администратором группы. Ключ тот же, что у реакций: пост не вернётся после переписывания.
CREATE TABLE `feed_hidden` (
	`event_id` integer NOT NULL REFERENCES `events`(`id`),
	`slot` text NOT NULL,
	`hidden_by` integer NOT NULL REFERENCES `users`(`id`),
	`created_at` integer NOT NULL,
	PRIMARY KEY (`event_id`, `slot`)
);
--> statement-breakpoint
-- Фото из Telegram: приходит в initData при входе, показывается в ленте участникам группы.
ALTER TABLE `users` ADD `photo_url` text;
