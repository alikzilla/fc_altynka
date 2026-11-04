ALTER TABLE `users` ADD `profile_completed_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `playing_position` text;--> statement-breakpoint
ALTER TABLE `users` ADD `dominant_foot` text;
--> statement-breakpoint
UPDATE users SET profile_completed_at = CASE WHEN created_at > 0 THEN created_at ELSE unixepoch() * 1000 END
WHERE profile_completed_at IS NULL AND kaspi_phone IS NOT NULL AND trim(kaspi_phone) <> '';
