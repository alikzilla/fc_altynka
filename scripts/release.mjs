// Релиз одной командой: `pnpm release` (прод) или `pnpm release --staging`.
//
// Прод: main без локальных правок и совпадает с origin/main → CI этого коммита зелёный → запомнить текущую версию
// Worker → если есть новые миграции: `pnpm backup`, затем миграции → деплой → health check и вебхук →
// при провале проверки автоматический откат кода на прежнюю версию. Отчёт пишется в artifacts/deploy/releases/.
// Staging: любая ветка, без проверки CI и без бэкапа (база тестовая), остальное так же.
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv, promisify } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const USAGE = 'Использование: pnpm release [--staging] [--skip-ci]';

export const TARGETS = {
  production: { env: null, database: 'fc-altynka', deployScript: 'deploy', webhookEnv: 'apps/worker/.webhook.env', backup: true, requireMain: true },
  staging: { env: 'staging', database: 'fc-altynka-staging', deployScript: 'deploy:staging', webhookEnv: 'apps/worker/.webhook.staging.env', backup: false, requireMain: false },
};

export function parseArgs(argv) {
  const o = { target: 'production', skipCi: false };
  for (const arg of argv) {
    if (arg === '--staging') o.target = 'staging';
    else if (arg === '--skip-ci') o.skipCi = true;
    else throw new Error(`Неизвестный аргумент ${arg}.\n${USAGE}`);
  }
  return o;
}

/** Имена ещё не применённых миграций из таблицы `wrangler d1 migrations list`. */
export function pendingMigrations(output) {
  if (/No migrations to apply/i.test(output)) return [];
  return [...output.matchAll(/\b(\d{4}_[\w-]+\.sql)\b/g)].map(m => m[1]);
}

/** Адрес и версия из вывода `wrangler deploy`. */
export function parseDeploy(output) {
  const url = output.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0];
  const version = output.match(/Current Version ID:\s*([0-9a-f-]{36})/)?.[1];
  if (!url || !version) throw new Error('Не удалось прочитать адрес и версию из вывода wrangler deploy.');
  return { url, version };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function runRelease({
  argv = process.argv.slice(2), log = console.log, exec = promisify(execFile), fetcher = fetch,
  readText = path => readFile(join(ROOT, path), 'utf8'), writeReport = defaultWriteReport,
  now = () => Date.now(), wait = sleep, healthAttempts = 10,
} = {}) {
  const opts = parseArgs(argv);
  const t = TARGETS[opts.target];
  const run = async (cmd, args) => (await exec(cmd, args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 })).stdout;
  const wrangler = (...args) => run('pnpm', ['--filter', '@altynka/worker', 'exec', 'wrangler', ...args, ...(t.env ? ['--env', t.env] : [])]);
  const git = async (...args) => (await run('git', args)).trim();
  const report = { target: opts.target, startedAt: new Date(now()).toISOString(), steps: [] };
  const step = (name, detail) => { report.steps.push({ name, ...detail }); log(`✓ ${name}${detail?.note ? `: ${detail.note}` : ''}`); };

  const commit = await git('rev-parse', 'HEAD');
  report.commit = commit;
  report.branch = await git('rev-parse', '--abbrev-ref', 'HEAD');
  if (t.requireMain) {
    if (report.branch !== 'main') throw new Error(`Прод выкатывается только из main, сейчас ${report.branch}.`);
    if (await git('status', '--porcelain')) throw new Error('Есть незакоммиченные изменения.');
    await git('fetch', '--quiet', 'origin', 'main');
    if (commit !== await git('rev-parse', 'origin/main')) throw new Error('Локальный main не совпадает с origin/main: сделай pull или push.');
  }
  step('Исходники', { note: `${report.branch} @ ${commit.slice(0, 7)}` });

  if (t.requireMain && !opts.skipCi) {
    const runs = JSON.parse(await run('gh', ['run', 'list', '--commit', commit, '--workflow', 'ci.yml', '--json', 'status,conclusion,url', '--limit', '1']));
    if (!runs.length) throw new Error('Для этого коммита нет запуска CI. Дождись его или запусти с --skip-ci.');
    if (runs[0].status !== 'completed') throw new Error(`CI ещё идёт: ${runs[0].url}`);
    if (runs[0].conclusion !== 'success') throw new Error(`CI не прошёл (${runs[0].conclusion}): ${runs[0].url}`);
    step('CI зелёный', { note: runs[0].url });
  }

  const previous = JSON.parse(await wrangler('deployments', 'status', '--json')).versions?.[0]?.version_id ?? null;
  report.previousVersion = previous;
  step('Текущая версия', { note: previous ?? 'нет' });

  const pending = pendingMigrations(await wrangler('d1', 'migrations', 'list', t.database, '--remote'));
  report.migrations = pending;
  if (pending.length) {
    if (t.backup) {
      const out = await run('pnpm', ['backup']);
      report.backup = out.match(/Для аварийного восстановления: (\S+)/)?.[1] ?? null;
      step('Бэкап с учебным восстановлением', { note: report.backup });
    }
    await wrangler('d1', 'migrations', 'apply', t.database, '--remote');
    step('Миграции', { note: pending.join(', ') });
  } else step('Миграции', { note: 'новых нет' });

  const deployedAt = now();
  const deployed = parseDeploy(await run('pnpm', ['run', t.deployScript]));
  Object.assign(report, { url: deployed.url, version: deployed.version });
  step('Деплой', { note: deployed.version });

  const problem = await verify({ url: deployed.url, webhookEnv: t.webhookEnv, deployedAt, fetcher, readText, wait, healthAttempts });
  if (problem) {
    report.failure = problem;
    if (previous && previous !== deployed.version) {
      await wrangler('rollback', previous, '--yes', '--message', `release: ${problem}`.slice(0, 100));
      report.rolledBackTo = previous;
      log(`✗ ${problem}. Код откатан на ${previous}.${pending.length ? ' Миграции остались применены: новые таблицы старому коду не мешают, но проверь их.' : ''}`);
    } else log(`✗ ${problem}. Откатывать не на что.`);
    report.reportFile = await writeReport(report);
    throw new Error(`Релиз не прошёл проверку: ${problem}. Отчёт: ${report.reportFile}`);
  }
  step('Проверка', { note: 'health ok, вебхук без ошибок' });
  report.finishedAt = new Date(now()).toISOString();
  report.reportFile = await writeReport(report);
  log('');
  log(`Готово: ${deployed.url}`);
  log(`Версия ${deployed.version}${previous ? `, откат: wrangler rollback ${previous}${t.env ? ` --env ${t.env}` : ''}` : ''}`);
  log(`Отчёт: ${report.reportFile}`);
  return report;
}

/** Health check и состояние вебхука после деплоя; строка с проблемой или null. */
async function verify({ url, webhookEnv, deployedAt, fetcher, readText, wait, healthAttempts }) {
  let health = 'нет ответа';
  for (let i = 0; i < healthAttempts; i++) {
    try {
      const r = await fetcher(`${url}/api/health`);
      const body = await r.json().catch(() => ({}));
      if (r.status === 200 && body.ok === true) { health = null; break; }
      health = `health ${r.status} ${body.error ?? ''}`.trim();
    } catch (e) { health = `health недоступен: ${e.message}`; }
    await wait(3000);
  }
  if (health) return health;

  let token;
  try { token = parseEnv(await readText(webhookEnv)).BOT_TOKEN; } catch { /* файла нет: вебхук не проверяем */ }
  if (!token) return null;
  // Дать Telegram доставить пару апдейтов новой версии.
  await wait(5000);
  let info;
  // Telegram недоступен с этой машины — не повод откатывать рабочий релиз; текст ошибки может содержать токен.
  try { info = (await (await fetcher(`https://api.telegram.org/bot${token}/getWebhookInfo`)).json()).result ?? {}; }
  catch { return null; }
  if (info.last_error_date && info.last_error_date * 1000 >= deployedAt) return `вебхук: ${info.last_error_message}`;
  return null;
}

async function defaultWriteReport(report) {
  const dir = join(ROOT, 'artifacts', 'deploy', 'releases');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${report.target}-${report.startedAt.replace(/[:.]/g, '-')}.json`);
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRelease().catch(error => {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  });
}
