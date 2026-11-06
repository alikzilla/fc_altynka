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
INSERT INTO `__new_skill_assessments`(user_id, version, teamwork, dribbling, technique, shooting, stamina, physical, passing, defending, created_at)
SELECT user_id, version, teamwork, dribbling, technique, shooting, stamina, physical, passing, defending, created_at FROM (
  SELECT *, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, community_id DESC) rn FROM skill_assessments
) WHERE rn = 1;--> statement-breakpoint
DROP TABLE `skill_assessments`;--> statement-breakpoint
ALTER TABLE `__new_skill_assessments` RENAME TO `skill_assessments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `communities` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `telegram_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `legacy` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `memberships` SET `legacy` = 1;--> statement-breakpoint
CREATE INDEX `memberships_user` ON `memberships` (`user_id`,`community_id`);