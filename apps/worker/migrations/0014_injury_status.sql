-- Травма отмечается администратором группы и действует только в этой группе.
ALTER TABLE memberships ADD COLUMN injured integer DEFAULT 0 NOT NULL;
