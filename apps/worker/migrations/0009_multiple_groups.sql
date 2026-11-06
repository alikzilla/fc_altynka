ALTER TABLE communities ADD COLUMN active integer NOT NULL DEFAULT 1;
ALTER TABLE memberships ADD COLUMN active integer NOT NULL DEFAULT 1;
ALTER TABLE memberships ADD COLUMN telegram_admin integer NOT NULL DEFAULT 0;
ALTER TABLE memberships ADD COLUMN legacy integer NOT NULL DEFAULT 0;
ALTER TABLE memberships ADD COLUMN display_name text;
ALTER TABLE memberships ADD COLUMN kaspi_phone text;
ALTER TABLE memberships ADD COLUMN profile_completed_at integer;
ALTER TABLE memberships ADD COLUMN playing_position text;
ALTER TABLE memberships ADD COLUMN dominant_foot text;
ALTER TABLE memberships ADD COLUMN notifications_enabled integer NOT NULL DEFAULT 0;

UPDATE memberships SET
  legacy = 1,
  display_name = (SELECT display_name FROM users WHERE id = memberships.user_id),
  kaspi_phone = (SELECT kaspi_phone FROM users WHERE id = memberships.user_id),
  profile_completed_at = (SELECT profile_completed_at FROM users WHERE id = memberships.user_id),
  playing_position = (SELECT playing_position FROM users WHERE id = memberships.user_id),
  dominant_foot = (SELECT dominant_foot FROM users WHERE id = memberships.user_id),
  notifications_enabled = (SELECT notifications_enabled FROM users WHERE id = memberships.user_id);

CREATE INDEX memberships_user ON memberships(user_id, community_id);
