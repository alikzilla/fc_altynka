CREATE TABLE `match_participants` (
	`event_id` integer NOT NULL,
	`signup_id` integer NOT NULL,
	`user_id` integer,
	`name` text NOT NULL,
	PRIMARY KEY(`event_id`, `signup_id`),
	FOREIGN KEY (`event_id`) REFERENCES `match_reviews`(`event_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signup_id`) REFERENCES `signups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_participants_user` ON `match_participants` (`event_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `match_reviews` (
	`event_id` integer PRIMARY KEY NOT NULL,
	`completed_at` integer NOT NULL,
	`completed_by` integer NOT NULL,
	`closes_at` integer NOT NULL,
	`roster_json` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "review_deadline" CHECK("match_reviews"."closes_at" > "match_reviews"."completed_at"),
	CONSTRAINT "review_roster_json" CHECK(json_valid("match_reviews"."roster_json") and json_array_length("match_reviews"."roster_json") > 0)
);
--> statement-breakpoint
CREATE INDEX `match_reviews_deadline` ON `match_reviews` (`closes_at`);--> statement-breakpoint
CREATE TABLE `player_votes` (
	`event_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`recipient_id` integer NOT NULL,
	`score` integer NOT NULL,
	PRIMARY KEY(`event_id`, `author_id`, `recipient_id`),
	FOREIGN KEY (`event_id`) REFERENCES `match_reviews`(`event_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`,`author_id`) REFERENCES `review_submissions`(`event_id`,`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`,`recipient_id`) REFERENCES `match_participants`(`event_id`,`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "player_vote_score" CHECK(typeof("player_votes"."score") = 'integer' and "player_votes"."score" between 1 and 10),
	CONSTRAINT "player_vote_other" CHECK("player_votes"."author_id" <> "player_votes"."recipient_id")
);
--> statement-breakpoint
CREATE INDEX `player_votes_recipient` ON `player_votes` (`recipient_id`,`event_id`);--> statement-breakpoint
CREATE TABLE `review_submissions` (
	`event_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`payload_json` text NOT NULL,
	`skipped` integer NOT NULL,
	`game_score` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `match_reviews`(`event_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`,`user_id`) REFERENCES `match_participants`(`event_id`,`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "submission_payload_json" CHECK(json_valid("review_submissions"."payload_json")),
	CONSTRAINT "submission_game_score" CHECK("review_submissions"."game_score" is null or (typeof("review_submissions"."game_score") = 'integer' and "review_submissions"."game_score" between 1 and 10)),
	CONSTRAINT "submission_skipped" CHECK("review_submissions"."skipped" in (0, 1)),
	CONSTRAINT "submission_answers" CHECK(("review_submissions"."skipped" = 1 and "review_submissions"."game_score" is null and json_array_length("review_submissions"."payload_json", '$.scores') = 0) or ("review_submissions"."skipped" = 0 and ("review_submissions"."game_score" is not null or json_array_length("review_submissions"."payload_json", '$.scores') > 0)))
);
--> statement-breakpoint
CREATE TABLE `skill_assessments` (
	`community_id` integer NOT NULL,
	`user_id` integer NOT NULL,
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
	PRIMARY KEY(`community_id`, `user_id`),
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "skill_teamwork_range" CHECK(typeof("skill_assessments"."teamwork") = 'integer' and "skill_assessments"."teamwork" between 1 and 10),
	CONSTRAINT "skill_dribbling_range" CHECK(typeof("skill_assessments"."dribbling") = 'integer' and "skill_assessments"."dribbling" between 1 and 10),
	CONSTRAINT "skill_technique_range" CHECK(typeof("skill_assessments"."technique") = 'integer' and "skill_assessments"."technique" between 1 and 10),
	CONSTRAINT "skill_shooting_range" CHECK(typeof("skill_assessments"."shooting") = 'integer' and "skill_assessments"."shooting" between 1 and 10),
	CONSTRAINT "skill_stamina_range" CHECK(typeof("skill_assessments"."stamina") = 'integer' and "skill_assessments"."stamina" between 1 and 10),
	CONSTRAINT "skill_physical_range" CHECK(typeof("skill_assessments"."physical") = 'integer' and "skill_assessments"."physical" between 1 and 10),
	CONSTRAINT "skill_passing_range" CHECK(typeof("skill_assessments"."passing") = 'integer' and "skill_assessments"."passing" between 1 and 10),
	CONSTRAINT "skill_defending_range" CHECK(typeof("skill_assessments"."defending") = 'integer' and "skill_assessments"."defending" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE `events` ADD `rating_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `rating_snapshot` text;
--> statement-breakpoint
-- Custom triggers are intentionally maintained alongside the generated schema.
-- A completion snapshot and a submission each persist all dependent rows atomically.
CREATE TRIGGER match_reviews_roster AFTER INSERT ON match_reviews BEGIN
  INSERT INTO match_participants(event_id, signup_id, user_id, name)
  SELECT NEW.event_id, json_extract(value, '$.signupId'), json_extract(value, '$.userId'), json_extract(value, '$.name')
  FROM json_each(NEW.roster_json);
END;
--> statement-breakpoint
CREATE TRIGGER review_submission_votes AFTER INSERT ON review_submissions BEGIN
  INSERT INTO player_votes(event_id, author_id, recipient_id, score)
  SELECT NEW.event_id, NEW.user_id, json_extract(value, '$.userId'), json_extract(value, '$.score')
  FROM json_each(NEW.payload_json, '$.scores');
END;
