CREATE TABLE `bill_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bill_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`units` integer NOT NULL,
	`amount` integer NOT NULL,
	`paid_amount` integer,
	`marked_by` integer,
	`paid_at` integer,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_lines_bill_user` ON `bill_lines` (`bill_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`receiver_user_id` integer NOT NULL,
	`field_amount` integer NOT NULL,
	`extras_json` text DEFAULT '[]' NOT NULL,
	`share` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`message_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receiver_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bills_event_id_unique` ON `bills` (`event_id`);--> statement-breakpoint
CREATE TABLE `communities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tg_chat_id` integer NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communities_tg_chat_id_unique` ON `communities` (`tg_chat_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`date` text NOT NULL,
	`comment` text,
	`start_time` text,
	`duration_hours` integer,
	`place` text,
	`status` text DEFAULT 'collecting' NOT NULL,
	`base_limit` integer DEFAULT 10 NOT NULL,
	`team_count` integer,
	`teams_published_at` integer,
	`event_message_id` integer,
	`teams_message_id` integer,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`community_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	`level` integer DEFAULT 5 NOT NULL,
	PRIMARY KEY(`community_id`, `user_id`),
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `signups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`user_id` integer,
	`guest_name` text,
	`invited_by` integer,
	`seq` integer NOT NULL,
	`manual` integer DEFAULT false NOT NULL,
	`left_at` integer,
	`guest_level` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signups_event_seq` ON `signups` (`event_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `signups_event_user` ON `signups` (`event_id`,`user_id`) WHERE user_id is not null;--> statement-breakpoint
CREATE TABLE `team_assignments` (
	`signup_id` integer PRIMARY KEY NOT NULL,
	`event_id` integer NOT NULL,
	`team_index` integer NOT NULL,
	FOREIGN KEY (`signup_id`) REFERENCES `signups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tg_id` integer NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text,
	`username` text,
	`display_name` text NOT NULL,
	`kaspi_phone` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_tg_id_unique` ON `users` (`tg_id`);