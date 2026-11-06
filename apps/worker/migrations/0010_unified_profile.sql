-- Profile is personal again. Codex's per-group copies (0009) may hold edits made after
-- it shipped; carry every non-null value that differs from the shared profile back to
-- users before dropping the columns. NULLs (untouched copies) never overwrite.
UPDATE `users` SET
  `display_name` = coalesce((SELECT m.display_name FROM memberships m WHERE m.user_id = users.id AND m.display_name IS NOT NULL AND m.display_name <> users.display_name ORDER BY m.legacy DESC, m.checked_at DESC LIMIT 1), `display_name`),
  `kaspi_phone` = coalesce((SELECT m.kaspi_phone FROM memberships m WHERE m.user_id = users.id AND m.kaspi_phone IS NOT NULL AND m.kaspi_phone IS NOT users.kaspi_phone ORDER BY m.legacy DESC, m.checked_at DESC LIMIT 1), `kaspi_phone`),
  `profile_completed_at` = coalesce(`profile_completed_at`, (SELECT min(m.profile_completed_at) FROM memberships m WHERE m.user_id = users.id)),
  `playing_position` = coalesce((SELECT m.playing_position FROM memberships m WHERE m.user_id = users.id AND m.playing_position IS NOT NULL AND m.playing_position IS NOT users.playing_position ORDER BY m.legacy DESC, m.checked_at DESC LIMIT 1), `playing_position`),
  `dominant_foot` = coalesce((SELECT m.dominant_foot FROM memberships m WHERE m.user_id = users.id AND m.dominant_foot IS NOT NULL AND m.dominant_foot IS NOT users.dominant_foot ORDER BY m.legacy DESC, m.checked_at DESC LIMIT 1), `dominant_foot`),
  `notifications_enabled` = CASE
    WHEN (SELECT count(*) FROM memberships m WHERE m.user_id = users.id) = 1
      THEN (SELECT m.notifications_enabled FROM memberships m WHERE m.user_id = users.id)
    ELSE max(`notifications_enabled`, coalesce((SELECT max(m.notifications_enabled) FROM memberships m WHERE m.user_id = users.id), 0))
  END;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_skill_assessments` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`teamwork` integer NOT NULL,
	`dribbling` integer NOT NULL,
	`technique` integer NOT NULL,
	`shooting` integer NOT NULL,
	`stamina` integer NOT NULL,
	`physical` integer NOT NULL,
	`passing` integer NOT NULL,
	`defending` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "skill_teamwork_range" CHECK(typeof("__new_skill_assessments"."teamwork") = 'integer' and "__new_skill_assessments"."teamwork" between 1 and 10),
	CONSTRAINT "skill_dribbling_range" CHECK(typeof("__new_skill_assessments"."dribbling") = 'integer' and "__new_skill_assessments"."dribbling" between 1 and 10),
	CONSTRAINT "skill_technique_range" CHECK(typeof("__new_skill_assessments"."technique") = 'integer' and "__new_skill_assessments"."technique" between 1 and 10),
	CONSTRAINT "skill_shooting_range" CHECK(typeof("__new_skill_assessments"."shooting") = 'integer' and "__new_skill_assessments"."shooting" between 1 and 10),
	CONSTRAINT "skill_stamina_range" CHECK(typeof("__new_skill_assessments"."stamina") = 'integer' and "__new_skill_assessments"."stamina" between 1 and 10),
	CONSTRAINT "skill_physical_range" CHECK(typeof("__new_skill_assessments"."physical") = 'integer' and "__new_skill_assessments"."physical" between 1 and 10),
	CONSTRAINT "skill_passing_range" CHECK(typeof("__new_skill_assessments"."passing") = 'integer' and "__new_skill_assessments"."passing" between 1 and 10),
	CONSTRAINT "skill_defending_range" CHECK(typeof("__new_skill_assessments"."defending") = 'integer' and "__new_skill_assessments"."defending" between 1 and 10)
);
--> statement-breakpoint
INSERT INTO `__new_skill_assessments`("user_id", "version", "teamwork", "dribbling", "technique", "shooting", "stamina", "physical", "passing", "defending", "created_at")
SELECT "user_id", "version", "teamwork", "dribbling", "technique", "shooting", "stamina", "physical", "passing", "defending", "created_at" FROM (
  SELECT *, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, community_id DESC) AS rn FROM `skill_assessments`
) WHERE rn = 1;--> statement-breakpoint
DROP TABLE `skill_assessments`;--> statement-breakpoint
ALTER TABLE `__new_skill_assessments` RENAME TO `skill_assessments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `memberships` DROP COLUMN `display_name`;--> statement-breakpoint
ALTER TABLE `memberships` DROP COLUMN `kaspi_phone`;--> statement-breakpoint
ALTER TABLE `memberships` DROP COLUMN `profile_completed_at`;--> statement-breakpoint
ALTER TABLE `memberships` DROP COLUMN `playing_position`;--> statement-breakpoint
ALTER TABLE `memberships` DROP COLUMN `dominant_foot`;--> statement-breakpoint
ALTER TABLE `memberships` DROP COLUMN `notifications_enabled`;