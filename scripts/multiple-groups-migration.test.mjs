import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('multiple-group migration preserves existing memberships and history, with empty new-team preferences', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const directory = new URL('../apps/worker/migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(name => /^000[0-8]_.*\.sql$/.test(name)).sort()) {
      db.exec(readFileSync(new URL(file, directory), 'utf8'));
    }
    db.exec(`
      INSERT INTO communities(id, tg_chat_id, title) VALUES (1, -100, 'Current');
      INSERT INTO users(id, tg_id, first_name, display_name, kaspi_phone, notifications_enabled,
        profile_completed_at, playing_position, dominant_foot, created_at)
        VALUES(1, 100, 'Telegram', 'Captain', '+77011234567', 1, 123, 'goalkeeper', 'left', 1);
      INSERT INTO memberships(community_id, user_id, role, level, checked_at) VALUES(1, 1, 'organizer', 7, 123);
      INSERT INTO events(id, community_id, date, status, created_by, created_at) VALUES(1, 1, '2026-11-07', 'billing', 1, 1);
      INSERT INTO signups(event_id, user_id, seq, created_at) VALUES(1, 1, 1, 1);
      INSERT INTO bills(event_id, receiver_user_id, field_amount, share, created_at) VALUES(1, 1, 4000, 4000, 1);
    `);
    db.exec(readFileSync(new URL('0009_multiple_groups.sql', directory), 'utf8'));
    const member = db.prepare('SELECT * FROM memberships WHERE community_id=1 AND user_id=1').get();
    assert.equal(member.display_name, 'Captain');
    assert.equal(member.kaspi_phone, '+77011234567');
    assert.equal(member.notifications_enabled, 1);
    assert.equal(member.profile_completed_at, 123);
    assert.equal(member.playing_position, 'goalkeeper');
    assert.equal(member.role, 'organizer');
    assert.equal(member.level, 7);
    assert.equal(member.legacy, 1);
    for (const table of ['events', 'bills', 'signups']) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 1);
    db.exec("INSERT INTO communities(id, tg_chat_id, title) VALUES(2, -200, 'New'); INSERT INTO memberships(community_id, user_id, display_name) VALUES(2, 1, 'Telegram');");
    const other = db.prepare('SELECT * FROM memberships WHERE community_id=2 AND user_id=1').get();
    assert.equal(other.kaspi_phone, null);
    assert.equal(other.playing_position, null);
    assert.equal(other.notifications_enabled, 0);
    assert.equal(other.legacy, 0);
    assert.equal(other.role, 'player');
  } finally { db.close(); }
});
