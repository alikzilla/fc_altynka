-- Награды матча: выбор каждого голосующего хранится в его ответе и раскладывается сюда триггером.
CREATE TABLE `award_votes` (
	`event_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`award` text NOT NULL,
	`recipient_id` integer NOT NULL,
	PRIMARY KEY(`event_id`, `author_id`, `award`),
	FOREIGN KEY (`event_id`) REFERENCES `match_reviews`(`event_id`),
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`event_id`,`author_id`) REFERENCES `review_submissions`(`event_id`,`user_id`),
	FOREIGN KEY (`event_id`,`recipient_id`) REFERENCES `match_participants`(`event_id`,`user_id`),
	CONSTRAINT "award_vote_kind" CHECK(`award` in ('mvp', 'forward', 'midfielder', 'defender', 'goalkeeper')),
	CONSTRAINT "award_vote_other" CHECK(`author_id` <> `recipient_id`)
);
--> statement-breakpoint
CREATE INDEX `award_votes_recipient` ON `award_votes` (`recipient_id`,`event_id`);
--> statement-breakpoint
-- A submission without `awards` (older mini app, skipped poll) yields no rows.
CREATE TRIGGER review_submission_awards AFTER INSERT ON review_submissions BEGIN
  INSERT INTO award_votes(event_id, author_id, award, recipient_id)
  SELECT NEW.event_id, NEW.user_id, key, value
  FROM json_each(NEW.payload_json, '$.awards');
END;
