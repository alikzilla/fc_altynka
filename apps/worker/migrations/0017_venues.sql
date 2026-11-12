-- Площадки группы: организатор добавляет поле один раз и выбирает его при назначении матча.
-- В матче по-прежнему хранится название (`events.place`), поэтому удаление площадки не меняет прошедшие матчи.
CREATE TABLE `venues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL REFERENCES `communities`(`id`),
	`name` text NOT NULL,
	`address` text,
	`map_url` text,
	`hourly_rate` integer,
	`created_by` integer REFERENCES `users`(`id`),
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venues_community_name` ON `venues` (`community_id`, `name`);
--> statement-breakpoint
-- Единственная площадка, которая раньше была зашита в мини-апп, переезжает в базу для уже подключённых групп.
INSERT INTO `venues` (`community_id`, `name`, `map_url`, `created_at`)
SELECT `id`, 'Школа Аксай', 'https://go.2gis.com/G47G5', unixepoch() * 1000 FROM `communities`;
