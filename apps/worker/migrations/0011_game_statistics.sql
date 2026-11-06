ALTER TABLE `events` ADD `protocol_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `started_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `completed_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `game_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `roster_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `game_state_json` text;
--> statement-breakpoint
CREATE TRIGGER game_state_valid_insert BEFORE INSERT ON events
WHEN NEW.protocol_version NOT IN (0,1) OR (NEW.game_state_json IS NOT NULL AND NOT json_valid(NEW.game_state_json))
 OR (NEW.started_at IS NOT NULL AND (NEW.protocol_version != 1 OR NEW.game_state_json IS NULL))
 OR (NEW.completed_at IS NOT NULL AND (NEW.started_at IS NULL OR NEW.completed_at < NEW.started_at))
BEGIN SELECT RAISE(ABORT, 'game_state_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER game_state_valid_update BEFORE UPDATE ON events
WHEN NEW.protocol_version NOT IN (0,1) OR (NEW.game_state_json IS NOT NULL AND NOT json_valid(NEW.game_state_json))
 OR (NEW.started_at IS NOT NULL AND (NEW.protocol_version != 1 OR NEW.game_state_json IS NULL))
 OR (NEW.completed_at IS NOT NULL AND (NEW.started_at IS NULL OR NEW.completed_at < NEW.started_at))
BEGIN SELECT RAISE(ABORT, 'game_state_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER game_event_locked BEFORE UPDATE ON events
WHEN OLD.protocol_version = 1 AND OLD.started_at IS NOT NULL AND (
 NEW.started_at IS NOT OLD.started_at OR NEW.protocol_version != 1 OR NEW.team_count IS NOT OLD.team_count OR NEW.base_limit IS NOT OLD.base_limit OR NEW.teams_roster IS NOT OLD.teams_roster OR NEW.rating_snapshot IS NOT OLD.rating_snapshot OR NEW.teams_published_at IS NOT OLD.teams_published_at OR NEW.date IS NOT OLD.date OR NEW.start_time IS NOT OLD.start_time OR NEW.duration_hours IS NOT OLD.duration_hours OR NEW.place IS NOT OLD.place
 OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS NOT OLD.completed_at))
BEGIN SELECT RAISE(ABORT, 'game_roster_locked'); END;
--> statement-breakpoint
CREATE TRIGGER game_event_roster_revision AFTER UPDATE OF team_count,base_limit,teams_roster,rating_snapshot,teams_published_at,date,start_time,duration_hours,place ON events
WHEN NEW.protocol_version = 1 AND NEW.started_at IS NULL AND (NEW.team_count IS NOT OLD.team_count OR NEW.base_limit IS NOT OLD.base_limit OR NEW.teams_roster IS NOT OLD.teams_roster OR NEW.rating_snapshot IS NOT OLD.rating_snapshot OR NEW.teams_published_at IS NOT OLD.teams_published_at OR NEW.date IS NOT OLD.date OR NEW.start_time IS NOT OLD.start_time OR NEW.duration_hours IS NOT OLD.duration_hours OR NEW.place IS NOT OLD.place)
BEGIN UPDATE events SET roster_revision = roster_revision + 1 WHERE id = NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER game_signups_insert_locked BEFORE INSERT ON signups
WHEN EXISTS (SELECT 1 FROM events WHERE id IN (NEW.event_id) AND protocol_version = 1 AND started_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'game_roster_locked'); END;
--> statement-breakpoint
CREATE TRIGGER game_signups_insert_revision AFTER INSERT ON signups
BEGIN UPDATE events SET roster_revision = roster_revision + 1 WHERE id IN (NEW.event_id) AND protocol_version = 1; END;
--> statement-breakpoint
CREATE TRIGGER game_signups_update_locked BEFORE UPDATE ON signups
WHEN EXISTS (SELECT 1 FROM events WHERE id IN (OLD.event_id,NEW.event_id) AND protocol_version = 1 AND started_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'game_roster_locked'); END;
--> statement-breakpoint
CREATE TRIGGER game_signups_update_revision AFTER UPDATE ON signups
BEGIN UPDATE events SET roster_revision = roster_revision + 1 WHERE id IN (OLD.event_id,NEW.event_id) AND protocol_version = 1; END;
--> statement-breakpoint
CREATE TRIGGER game_signups_delete_locked BEFORE DELETE ON signups
WHEN EXISTS (SELECT 1 FROM events WHERE id IN (OLD.event_id) AND protocol_version = 1 AND started_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'game_roster_locked'); END;
--> statement-breakpoint
CREATE TRIGGER game_signups_delete_revision AFTER DELETE ON signups
BEGIN UPDATE events SET roster_revision = roster_revision + 1 WHERE id IN (OLD.event_id) AND protocol_version = 1; END;
--> statement-breakpoint
CREATE TRIGGER game_team_assignments_insert_locked BEFORE INSERT ON team_assignments
WHEN EXISTS (SELECT 1 FROM events WHERE id IN (NEW.event_id) AND protocol_version = 1 AND started_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'game_roster_locked'); END;
--> statement-breakpoint
CREATE TRIGGER game_team_assignments_insert_revision AFTER INSERT ON team_assignments
BEGIN UPDATE events SET roster_revision = roster_revision + 1 WHERE id IN (NEW.event_id) AND protocol_version = 1; END;
--> statement-breakpoint
CREATE TRIGGER game_team_assignments_update_locked BEFORE UPDATE ON team_assignments
WHEN EXISTS (SELECT 1 FROM events WHERE id IN (OLD.event_id,NEW.event_id) AND protocol_version = 1 AND started_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'game_roster_locked'); END;
--> statement-breakpoint
CREATE TRIGGER game_team_assignments_update_revision AFTER UPDATE ON team_assignments
BEGIN UPDATE events SET roster_revision = roster_revision + 1 WHERE id IN (OLD.event_id,NEW.event_id) AND protocol_version = 1; END;
--> statement-breakpoint
CREATE TRIGGER game_team_assignments_delete_locked BEFORE DELETE ON team_assignments
WHEN EXISTS (SELECT 1 FROM events WHERE id IN (OLD.event_id) AND protocol_version = 1 AND started_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'game_roster_locked'); END;
--> statement-breakpoint
CREATE TRIGGER game_team_assignments_delete_revision AFTER DELETE ON team_assignments
BEGIN UPDATE events SET roster_revision = roster_revision + 1 WHERE id IN (OLD.event_id) AND protocol_version = 1; END;
