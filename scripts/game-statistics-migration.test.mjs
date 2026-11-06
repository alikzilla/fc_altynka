import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('0011 preserves legacy data, locks started rosters and tracks preparation revisions', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    const directory = new URL('../apps/worker/migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(n => /^00(?:0\d|10)_.*\.sql$/.test(n)).sort()) db.exec(readFileSync(new URL(file, directory), 'utf8'));
    db.exec(`INSERT INTO communities(id,tg_chat_id,title) VALUES(1,-100,'Football');
      INSERT INTO users(id,tg_id,first_name,display_name,created_at) VALUES(1,100,'Player','Player',1);
      INSERT INTO events(id,community_id,date,status,created_by,created_at) VALUES
      (1,1,'2026-11-06','scheduled',1,1),(2,1,'2026-11-06','billing',1,1),(3,1,'2026-11-06','collecting',1,1),(4,1,'2026-11-06','closed',1,1);
      INSERT INTO signups(id,event_id,guest_name,seq,created_at) VALUES(1,1,'Guest',1,1);
      INSERT INTO team_assignments(signup_id,event_id,team_index) VALUES(1,1,0);
      INSERT INTO bills(event_id,receiver_user_id,field_amount,share,created_at) VALUES(2,1,10000,5000,1);
      INSERT INTO match_reviews(event_id,completed_at,completed_by,closes_at,roster_json) VALUES(4,1,1,2,'[{"signupId":1,"userId":null,"name":"Guest"}]');`);
    db.exec(readFileSync(new URL('0011_game_statistics.sql', directory), 'utf8'));
    assert.deepEqual({...db.prepare('SELECT protocol_version,started_at,completed_at,game_state_json FROM events WHERE id=1').get()}, {protocol_version:0,started_at:null,completed_at:null,game_state_json:null});
    assert.equal(db.prepare('SELECT field_amount FROM bills').get().field_amount,10000);
    assert.equal(db.prepare('SELECT count(*) n FROM match_reviews').get().n,1);
    db.exec(`UPDATE events SET protocol_version=1 WHERE id=1; UPDATE signups SET guest_name='Guest edited' WHERE id=1;`);
    assert.ok(db.prepare('SELECT roster_revision n FROM events WHERE id=1').get().n > 0);
    assert.throws(() => db.exec(`UPDATE events SET game_state_json='bad' WHERE id=1`));
    assert.throws(() => db.exec('UPDATE events SET completed_at=10 WHERE id=1'));
    assert.throws(() => db.exec('UPDATE events SET started_at=10 WHERE id=1'));
    db.exec(`UPDATE events SET started_at=10,game_state_json='{}' WHERE id=1`);
    for (const statement of [
      `UPDATE signups SET guest_name='Changed' WHERE id=1`, `DELETE FROM signups WHERE id=1`,
      `INSERT INTO signups(event_id,guest_name,seq,created_at) VALUES(1,'Late',2,1)`,
      `UPDATE team_assignments SET team_index=1 WHERE signup_id=1`, `DELETE FROM team_assignments WHERE signup_id=1`,
      `UPDATE events SET team_count=3 WHERE id=1`, `UPDATE events SET started_at=NULL WHERE id=1`,
      `UPDATE events SET status='cancelled' WHERE id=1`,
    ]) assert.throws(() => db.exec(statement), /game_roster_locked|game_state_invalid/);
    db.exec('UPDATE events SET status=\'closed\' WHERE id=1');
    db.exec(`INSERT INTO signups(event_id,guest_name,seq,created_at) VALUES(3,'Legacy',1,1)`);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { db.close(); }
});
