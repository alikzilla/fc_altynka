-- Календарь доступности: обычный график по дням недели (0 — понедельник) и отметки на конкретные даты.
-- Общий для всех групп человека. Нет строки — «не указано»; parts — части дня через запятую, пусто — любое время.
CREATE TABLE `availability_weekly` (
	`user_id` integer NOT NULL REFERENCES `users`(`id`),
	`weekday` integer NOT NULL CHECK (`weekday` BETWEEN 0 AND 6),
	`status` text NOT NULL CHECK (`status` IN ('yes', 'no')),
	`parts` text DEFAULT '' NOT NULL,
	PRIMARY KEY (`user_id`, `weekday`)
);
--> statement-breakpoint
CREATE TABLE `availability_days` (
	`user_id` integer NOT NULL REFERENCES `users`(`id`),
	`date` text NOT NULL,
	`status` text NOT NULL CHECK (`status` IN ('yes', 'no')),
	`parts` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`user_id`, `date`)
);
