import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('multiple-group migration keeps profile on users, preserves memberships and history, one assessment per user', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const directory = new URL('../apps/worker/migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(name => /^000[0-8]_.*\.sql$/.test(name)).sort()) {
      db.exec(readFileSync(new URL(file, directory), 'utf8'));
    }
    db.exec(`
      INSERT INTO communities(id, tg_chat_id, title) VALUES (1, -100, 'Current'), (2, -200, 'Other');
      INSERT INTO users(id, tg_id, first_name, display_name, kaspi_phone, notifications_enabled,
        profile_completed_at, playing_position, dominant_foot, created_at)
        VALUES(1, 100, 'Telegram', 'Captain', '+77011234567', 1, 123, 'goalkeeper', 'left', 1);
      INSERT INTO memberships(community_id, user_id, role, level, checked_at) VALUES(1, 1, 'organizer', 7, 123);
      INSERT INTO memberships(community_id, user_id, role, level, checked_at) VALUES(2, 1, 'player', 3, 124);
      INSERT INTO skill_assessments(community_id, user_id, version, teamwork, dribbling, technique, shooting, stamina, physical, passing, defending, created_at) VALUES
        (1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 100), (2, 1, 1, 8, 8, 8, 8, 8, 8, 8, 8, 200);
      INSERT INTO events(id, community_id, date, status, created_by, created_at) VALUES(1, 1, '2026-11-07', 'billing', 1, 1);
      INSERT INTO signups(event_id, user_id, seq, created_at) VALUES(1, 1, 1, 1);
      INSERT INTO bills(event_id, receiver_user_id, field_amount, share, created_at) VALUES(1, 1, 4000, 4000, 1);
    `);
    db.exec(readFileSync(new URL('0009_multiple_groups.sql', directory), 'utf8'));
    const member = db.prepare('SELECT * FROM memberships WHERE community_id=1 AND user_id=1').get();
    assert.equal(db.prepare('SELECT count(*) n FROM skill_assessments WHERE user_id=1').get().n, 1);
    assert.equal(db.prepare('SELECT teamwork FROM skill_assessments WHERE user_id=1').get().teamwork, 8);
    assert.equal(member.legacy, 1); assert.equal(member.role, 'organizer'); assert.equal(member.level, 7);
    assert.ok(!('display_name' in member)); assert.ok(!('kaspi_phone' in member));
    assert.equal(db.prepare('SELECT display_name FROM users WHERE id=1').get().display_name, 'Captain');
    for (const table of ['events', 'bills', 'signups']) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 1);
    const other = db.prepare('SELECT * FROM memberships WHERE community_id=2 AND user_id=1').get();
    assert.equal(other.legacy, 1); assert.equal(other.role, 'player'); assert.equal(other.level, 3);
    // Person-scoped lookups go through memberships by user.
    const index = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='memberships_user'`).get();
    assert.equal(index?.name, 'memberships_user');
    assert.deepEqual(db.prepare(`PRAGMA index_info('memberships_user')`).all().map(c => c.name), ['user_id', 'community_id']);
    // One assessment per person, skills stay within 1..10.
    const assessment = (userId, teamwork) => db.prepare(`INSERT INTO skill_assessments(user_id, version, teamwork, dribbling, technique, shooting, stamina, physical, passing, defending, created_at)
      VALUES (?, 1, ?, 5, 5, 5, 5, 5, 5, 5, 300)`).run(userId, teamwork);
    assert.throws(() => assessment(1, 5), /UNIQUE|PRIMARY KEY/);
    db.exec(`INSERT INTO users(id, tg_id, first_name, display_name, created_at) VALUES(2, 200, 'Second', 'Second', 1)`);
    assert.throws(() => assessment(2, 11), /CHECK constraint failed/);
    assert.throws(() => assessment(2, 0), /CHECK constraint failed/);
    assessment(2, 10);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});
