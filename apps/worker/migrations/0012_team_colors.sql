ALTER TABLE events ADD COLUMN team_colors text;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN team_colors_revision integer NOT NULL DEFAULT 0;
