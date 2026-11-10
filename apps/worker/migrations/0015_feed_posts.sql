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
