// Резервная копия продовой D1 в git-игнорируемую artifacts/deploy/backups/:
//   <имя>.sql          — сырой `wrangler d1 export --remote`;
//   <имя>.restore.sql  — тот же дамп в порядке, который D1 может залить обратно (см. toRestoreSql);
// затем учебное восстановление .restore.sql в одноразовую локальную D1 и сверка числа строк в каждой таблице.
// Только чтение продовой базы. Экспорт на несколько секунд блокирует запросы к D1: не запускать в разгар матча.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATABASE = 'fc-altynka';
/** Без этих таблиц дамп точно неполный. */
const REQUIRED_TABLES = ['communities', 'users', 'memberships', 'events', 'signups', 'bills', 'd1_migrations'];

export const backupName = (date = new Date()) => `${DATABASE}-${date.toISOString().replace(/[:.]/g, '-')}.sql`;

/**
 * Загрузить SQL-дамп в пустую базу в памяти. Бросает, если дамп обрывается, не исполняется или в нём нет
 * обязательных таблиц; иначе возвращает число строк в каждой таблице.
 */
export function verifyDump(sql) {
  // Дамп D1 вставляет строки в порядке таблиц, а не зависимостей: ключи проверяются после загрузки целиком.
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  try {
    db.exec(sql);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
    const missing = REQUIRED_TABLES.filter(t => !tables.includes(t));
    if (missing.length) throw new Error(`В дампе нет таблиц: ${missing.join(', ')}`);
    const fk = db.prepare('PRAGMA foreign_key_check').all();
    if (fk.length) throw new Error(`Нарушены внешние ключи: ${fk.length} строк, например ${JSON.stringify(fk[0])}`);
    return Object.fromEntries(tables.map(t => [t, db.prepare(`SELECT count(*) AS n FROM "${t.replaceAll('"', '""')}"`).get().n]));
  } finally {
    db.close();
  }
}

const ident = name => `"${name.replaceAll('"', '""')}"`;

/** Таблицы так, чтобы родитель шёл раньше ссылающихся на него (связи на себя и циклы не мешают). */
function parentsFirst(db, tables) {
  const parents = new Map(tables.map(t => [t, new Set(db.prepare(`SELECT "table" AS p FROM pragma_foreign_key_list(?)`).all(t).map(r => r.p).filter(p => p !== t && tables.includes(p)))]));
  const order = [];
  const visit = (t, path = new Set()) => {
    if (order.includes(t) || path.has(t)) return;
    path.add(t);
    for (const p of parents.get(t)) visit(p, path);
    order.push(t);
  };
  for (const t of tables) visit(t);
  return order;
}

/**
 * Сырой дамп D1 нельзя залить обратно в D1: строки таблицы вставляются до создания таблиц, на которые она
 * ссылается, и D1 падает с `no such table: main.users`. Здесь дамп загружается в SQLite и выписывается заново:
 * все таблицы и индексы, затем строки (родители раньше детей), и только в конце триггеры — иначе триггеры
 * вида AFTER INSERT размножили бы восстановленные строки.
 */
export function toRestoreSql(sql) {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  try {
    db.exec(sql);
    const objects = type => db.prepare("SELECT name, sql FROM sqlite_master WHERE type = ? AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid").all(type);
    const tableSql = new Map(objects('table').map(t => [t.name, t.sql]));
    const tables = parentsFirst(db, [...tableSql.keys()]);
    // Индексы до строк: составной внешний ключ (award_votes → match_participants) требует уникального индекса
    // у родителя уже при вставке, иначе D1 отвечает `foreign key mismatch`.
    const out = ['PRAGMA defer_foreign_keys=TRUE;', ...tables.map(t => `${tableSql.get(t)};`), ...objects('index').map(o => `${o.sql};`)];
    for (const t of tables) {
      const cols = db.prepare('SELECT name FROM pragma_table_info(?) ORDER BY cid').all(t).map(c => c.name);
      const row = `'INSERT INTO ${ident(t).replaceAll("'", "''")} (${cols.map(ident).join(',').replaceAll("'", "''")}) VALUES(' || ${cols.map(c => `quote(${ident(c)})`).join(" || ',' || ")} || ');'`;
      for (const r of db.prepare(`SELECT ${row} AS s FROM ${ident(t)} ORDER BY rowid`).all()) out.push(r.s);
    }
    for (const type of ['view', 'trigger']) for (const o of objects(type)) out.push(`${o.sql};`);
    return `${out.join('\n')}\n`;
  } finally {
    db.close();
  }
}

/** Залить .restore.sql в одноразовую локальную D1 и сверить число строк с проверенным дампом. */
export async function restoreDrill(file, counts, exec) {
  const dir = await mkdtemp(join(tmpdir(), 'altynka-restore-'));
  const wrangler = ['--filter', '@altynka/worker', 'exec', 'wrangler', 'd1', 'execute', DATABASE, '--local', `--persist-to=${dir}`];
  try {
    await exec('pnpm', [...wrangler, `--file=${file}`, '--yes'], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
    const query = `SELECT ${Object.keys(counts).map(t => `(SELECT count(*) FROM ${ident(t)}) AS ${ident(t)}`).join(', ')}`;
    const { stdout } = await exec('pnpm', [...wrangler, '--json', `--command=${query}`], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
    const restored = JSON.parse(stdout.slice(stdout.indexOf('[')))[0].results[0];
    const diff = Object.entries(counts).filter(([t, n]) => restored[t] !== n);
    if (diff.length) throw new Error(`После восстановления не совпало число строк: ${diff.map(([t, n]) => `${t} ${restored[t]} вместо ${n}`).join(', ')}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function runBackup({ log = console.log, exec = promisify(execFile), now = new Date() } = {}) {
  const dir = join(ROOT, 'artifacts', 'deploy', 'backups');
  await mkdir(dir, { recursive: true });
  const file = join(dir, backupName(now));
  log(`Экспорт ${DATABASE} (remote) → ${file}`);
  await exec('pnpm', ['--filter', '@altynka/worker', 'exec', 'wrangler', 'd1', 'export', DATABASE, '--remote', `--output=${file}`], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
  const raw = await readFile(file, 'utf8');
  const counts = verifyDump(raw);
  const restoreFile = file.replace(/\.sql$/, '.restore.sql');
  await writeFile(restoreFile, toRestoreSql(raw));
  log(`Дамп проверен: ${((await stat(file)).size / 1024).toFixed(1)} КБ, ${Object.keys(counts).length} таблиц.`);
  for (const [table, n] of Object.entries(counts)) log(`  ${table}: ${n}`);
  log('Учебное восстановление в одноразовую локальную D1…');
  await restoreDrill(restoreFile, counts, exec);
  log(`Восстановление проверено, все строки на месте. Для аварийного восстановления: ${restoreFile}`);
  return { file, restoreFile, counts };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackup().catch(error => {
    console.error(`Бэкап не удался: ${error.message}`);
    process.exitCode = 1;
  });
}
