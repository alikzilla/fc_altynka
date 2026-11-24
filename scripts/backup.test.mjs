import assert from 'node:assert/strict';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { backupName, pruneBackups, runBackup, toRestoreSql, verifyDump } from './backup.mjs';

const MIGRATIONS = fileURLToPath(new URL('../apps/worker/migrations/', import.meta.url));

/**
 * Схема из всех миграций и несколько строк в формате дампа wrangler: без PRAGMA миграций (в дампе D1 только CREATE)
 * и с триггерами в самом конце, после строк, как их выписывает `wrangler d1 export`.
 */
async function dump(extra = '') {
  const files = (await readdir(MIGRATIONS)).filter(f => f.endsWith('.sql')).sort();
  const migrations = (await Promise.all(files.map(f => readFile(join(MIGRATIONS, f), 'utf8')))).join('\n')
    .replaceAll('--> statement-breakpoint', '').replace(/^PRAGMA foreign_keys\s*=.*$/gim, '');
  const triggers = migrations.match(/CREATE TRIGGER[\s\S]*?\bEND;/g) ?? [];
  const schema = triggers.reduce((s, t) => s.replace(t, ''), migrations);
  return `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);
${schema}
INSERT INTO "d1_migrations" ("id","name") VALUES(1,'0000_init.sql');
${extra}
${triggers.join('\n')}`;
}

test('a full dump loads into an empty database and reports rows per table', async () => {
  const counts = verifyDump(await dump(`INSERT INTO "communities" ("id","tg_chat_id","title") VALUES(1,-100500,'Группа');`));
  assert.equal(counts.communities, 1);
  assert.equal(counts.d1_migrations, 1);
  assert.equal(counts.users, 0);
});

test('a cut-off dump is rejected', async () => {
  const full = await dump();
  assert.throws(() => verifyDump(full.slice(0, full.length / 2)));
});

test('a dump without the main tables is rejected', () => {
  assert.throws(() => verifyDump('CREATE TABLE users(id INTEGER);'), /В дампе нет таблиц: communities/);
});

test('rows pointing at missing parents are rejected', async () => {
  const sql = await dump(`INSERT INTO "venues" ("id","community_id","name","created_at") VALUES(1,999,'Манеж',0);`);
  assert.throws(() => verifyDump(sql), /Нарушены внешние ключи/);
});

// The order `wrangler d1 export` really produces: a table's rows come before the table it references exists.
const d1Order = `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id), note TEXT);
INSERT INTO "child" VALUES(1,1,'it''s; a
multi-line note');
CREATE TABLE parent(id INTEGER PRIMARY KEY, name TEXT, data BLOB, score REAL);
INSERT INTO "parent" VALUES(1,'Тимур',X'00FF',4.5);
CREATE TABLE log(id INTEGER PRIMARY KEY AUTOINCREMENT, child_id INTEGER);
INSERT INTO "log" VALUES(1,1);
CREATE INDEX child_parent ON child(parent_id);
CREATE TRIGGER child_log AFTER INSERT ON child BEGIN INSERT INTO log(child_id) VALUES (NEW.id); END;
`;

test('the raw D1 order cannot be restored where foreign keys are enforced, the restore order can', () => {
  // D1 enforces foreign keys: the raw export fails exactly like `wrangler d1 execute` did on the real dump.
  assert.throws(() => new DatabaseSync(':memory:').exec(d1Order), /no such table: main.parent/);
  const db = new DatabaseSync(':memory:');
  db.exec(toRestoreSql(d1Order));
  assert.deepEqual({ ...db.prepare('SELECT * FROM child').get() }, { id: 1, parent_id: 1, note: "it's; a\nmulti-line note" });
  const parent = db.prepare('SELECT * FROM parent').get();
  assert.deepEqual([parent.name, [...parent.data], parent.score], ['Тимур', [0, 255], 4.5]);
  // Triggers come last: restoring `child` did not log a second row.
  assert.equal(db.prepare('SELECT count(*) AS n FROM log').get().n, 1);
  assert.deepEqual(db.prepare("SELECT type, name FROM sqlite_master WHERE type IN ('index', 'trigger') ORDER BY type, name").all().map(r => `${r.type}:${r.name}`), ['index:child_parent', 'trigger:child_log']);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('the full schema with rosters and awards survives the restore order: unique keys exist before rows, no duplicates', async () => {
  const sql = await dump(`
INSERT INTO "match_participants" ("event_id","signup_id","user_id","name") VALUES(1,1,1,'Тимур');
INSERT INTO "match_participants" ("event_id","signup_id","user_id","name") VALUES(1,2,2,'Арман');
INSERT INTO "match_reviews" ("event_id","completed_at","completed_by","closes_at","roster_json") VALUES(1,0,1,1,'[{"signupId":1,"userId":1,"name":"Тимур"},{"signupId":2,"userId":2,"name":"Арман"}]');
INSERT INTO "communities" ("id","tg_chat_id","title") VALUES(1,-100500,'Группа');
INSERT INTO "users" ("id","tg_id","first_name","display_name","created_at") VALUES(1,501,'Тимур','Тимур',0);
INSERT INTO "users" ("id","tg_id","first_name","display_name","created_at") VALUES(2,502,'Арман','Арман',0);
INSERT INTO "events" ("id","community_id","date","created_by","created_at") VALUES(1,1,'2026-11-20',1,0);
INSERT INTO "signups" ("id","event_id","user_id","seq","created_at") VALUES(1,1,1,1,0);
INSERT INTO "signups" ("id","event_id","user_id","seq","created_at") VALUES(2,1,2,2,0);
INSERT INTO "review_submissions" ("event_id","user_id","payload_json","skipped","game_score","created_at") VALUES(1,1,'{"scores":[],"awards":{}}',0,5,0);
INSERT INTO "award_votes" ("event_id","author_id","award","recipient_id") VALUES(1,1,'mvp',2);`);
  const db = new DatabaseSync(':memory:');
  db.exec(toRestoreSql(sql));
  assert.equal(db.prepare('SELECT count(*) AS n FROM match_participants').get().n, 2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM award_votes').get().n, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('the backup exports the remote database, writes a restorable copy and rehearses the restore', async () => {
  const calls = [];
  const sql = await dump();
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const output = args.find(a => a.startsWith('--output='));
    if (output) await writeFile(output.slice('--output='.length), sql);
    const command = args.find(a => a.startsWith('--command='));
    // The drill's count query against the "restored" local database: answer like wrangler --json does.
    if (command) {
      const db = new DatabaseSync(':memory:');
      db.exec(await readFile(calls.find(c => c.some(a => a.startsWith('--file=')))
        .find(a => a.startsWith('--file=')).slice('--file='.length), 'utf8'));
      return { stdout: `noise\n${JSON.stringify([{ results: [{ ...db.prepare(command.slice('--command='.length)).get() }] }])}` };
    }
    return { stdout: '' };
  };
  const dir = await mkdtemp(join(tmpdir(), 'altynka-backup-test-'));
  const { file, restoreFile, counts } = await runBackup({ log: () => {}, exec, now: new Date('2026-11-24T10:00:00Z'), dir });
  assert.deepEqual(calls[0].slice(0, 8), ['pnpm', '--filter', '@altynka/worker', 'exec', 'wrangler', 'd1', 'export', 'fc-altynka']);
  assert.ok(calls[0].includes('--remote'));
  assert.match(file, /fc-altynka-2026-11-24T10-00-00-000Z\.sql$/);
  assert.match(restoreFile, /fc-altynka-2026-11-24T10-00-00-000Z\.restore\.sql$/);
  // The drill only ever touches a throwaway local database.
  for (const call of calls.slice(1)) {
    assert.ok(call.includes('--local') && !call.includes('--remote'));
    assert.ok(call.some(a => a.startsWith('--persist-to=')));
  }
  assert.equal(counts.communities, 0);
  await rm(dir, { recursive: true });
});

test('only the newest backups are kept, both files of a backup go together, other files stay', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'altynka-prune-test-'));
  const stamps = Array.from({ length: 12 }, (_, i) => backupName(new Date(Date.UTC(2026, 10, 1 + i))));
  for (const name of stamps) { await writeFile(join(dir, name), ''); await writeFile(join(dir, name.replace(/\.sql$/, '.restore.sql')), ''); }
  await writeFile(join(dir, 'notes.txt'), 'keep me');
  const removed = await pruneBackups(dir, 10);
  assert.equal(removed.length, 2);
  const left = (await readdir(dir)).sort();
  assert.equal(left.length, 10 * 2 + 1);
  assert.ok(left.includes('notes.txt'));
  // The two oldest (1 and 2 November) are gone, with their .restore.sql.
  assert.ok(!left.some(n => n.includes('2026-11-01') || n.includes('2026-11-02')));
  assert.ok(left.includes(stamps[11]) && left.includes(stamps[11].replace(/\.sql$/, '.restore.sql')));
  await rm(dir, { recursive: true });
});

test('backup names sort by time', () => {
  assert.ok(backupName(new Date('2026-01-02T00:00:00Z')) > backupName(new Date('2026-01-01T23:59:59Z')));
});
