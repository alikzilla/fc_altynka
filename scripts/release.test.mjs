import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseArgs, parseDeploy, pendingMigrations, runRelease } from './release.mjs';

const SHA = 'a'.repeat(40);
const OLD = '11111111-1111-4111-8111-111111111111';
const NEW = '22222222-2222-4222-8222-222222222222';
const DEPLOY_OUT = `Uploaded fc-altynka (15.91 sec)\n  https://fc-altynka.example.workers.dev\n  schedule: */5 * * * *\nCurrent Version ID: ${NEW}\n`;
const MIGRATIONS_TABLE = '│ Name                   │\n│ 0021_something.sql │\n';

/** Fake shell: answers each command like the real tools and records what ran. */
function world(o = {}) {
  const calls = [];
  const exec = async (cmd, args) => {
    const line = [cmd, ...args].join(' ');
    calls.push(line);
    if (cmd === 'git') {
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return { stdout: `${o.branch ?? 'main'}\n` };
      if (args[0] === 'rev-parse' && args[1] === 'origin/main') return { stdout: `${o.originSha ?? SHA}\n` };
      if (args[0] === 'rev-parse') return { stdout: `${SHA}\n` };
      if (args[0] === 'status') return { stdout: o.dirty ? ' M README.md\n' : '' };
      return { stdout: '' };
    }
    if (cmd === 'gh') return { stdout: JSON.stringify(o.ci ?? [{ status: 'completed', conclusion: 'success', url: 'https://ci/1' }]) };
    if (line.includes('deployments status')) return { stdout: JSON.stringify({ versions: [{ version_id: OLD, percentage: 100 }] }) };
    if (line.includes('migrations list')) return { stdout: o.pending ? MIGRATIONS_TABLE : '✅ No migrations to apply!' };
    if (line === 'pnpm backup') return { stdout: 'Восстановление проверено, все строки на месте. Для аварийного восстановления: /x/backup.restore.sql\n' };
    if (line.startsWith('pnpm run deploy')) return { stdout: DEPLOY_OUT };
    return { stdout: '' };
  };
  const fetcher = async url => {
    if (url.endsWith('/api/health')) return Response.json(o.health ?? { ok: true }, { status: o.health ? 503 : 200 });
    if (url.includes('getWebhookInfo')) return Response.json({ ok: true, result: o.webhook ?? { pending_update_count: 0 } });
    throw new Error(`unexpected ${url}`);
  };
  const reports = [];
  const run = (argv = []) => runRelease({
    argv, exec, fetcher, log: () => {}, wait: async () => {}, healthAttempts: 2, now: () => 1_000_000,
    readText: async () => "BOT_TOKEN='123:abc'\n", writeReport: async r => { reports.push(r); return '/x/report.json'; },
  });
  return { calls, run, reports };
}

test('a production release without migrations: checks, deploy, verification, no backup', async () => {
  const w = world();
  const r = await w.run();
  assert.equal(r.version, NEW);
  assert.equal(r.previousVersion, OLD);
  assert.deepEqual(r.migrations, []);
  assert.ok(!w.calls.includes('pnpm backup'));
  assert.ok(w.calls.some(c => c === 'pnpm run deploy'));
  assert.ok(!w.calls.some(c => c.includes('rollback')));
});

test('pending migrations get a verified backup first, then are applied before the deploy', async () => {
  const w = world({ pending: true });
  const r = await w.run();
  const at = s => w.calls.findIndex(c => c.includes(s));
  assert.ok(at('pnpm backup') < at('migrations apply fc-altynka --remote') && at('migrations apply') < at('pnpm run deploy'));
  assert.deepEqual(r.migrations, ['0021_something.sql']);
  assert.equal(r.backup, '/x/backup.restore.sql');
});

test('production is released only from a clean main that matches origin and passed CI', async () => {
  await assert.rejects(world({ branch: 'feature' }).run(), /только из main/);
  await assert.rejects(world({ dirty: true }).run(), /незакоммиченные/);
  await assert.rejects(world({ originSha: 'b'.repeat(40) }).run(), /не совпадает с origin\/main/);
  await assert.rejects(world({ ci: [] }).run(), /нет запуска CI/);
  await assert.rejects(world({ ci: [{ status: 'in_progress', url: 'u' }] }).run(), /CI ещё идёт/);
  await assert.rejects(world({ ci: [{ status: 'completed', conclusion: 'failure', url: 'u' }] }).run(), /CI не прошёл/);
  // Nothing was deployed by any of the refused runs.
  const w = world({ dirty: true });
  await w.run().catch(() => {});
  assert.ok(!w.calls.some(c => c.includes('deploy')));
});

test('--skip-ci skips only the CI check', async () => {
  const w = world({ ci: [] });
  await w.run(['--skip-ci']);
  assert.ok(!w.calls.some(c => c.startsWith('gh ')));
});

test('a failed health check rolls the code back to the previous version', async () => {
  const w = world({ health: { ok: false, error: 'cron_stale' } });
  await assert.rejects(w.run(), /Релиз не прошёл проверку: health 503 cron_stale/);
  assert.ok(w.calls.some(c => c.includes(`rollback ${OLD} --yes`)));
  assert.equal(w.reports[0].rolledBackTo, OLD);
});

test('a webhook error after the deploy rolls back; an older one does not', async () => {
  const fresh = world({ webhook: { last_error_date: 2_000, last_error_message: 'Wrong response from the webhook: 500' } });
  await assert.rejects(fresh.run(), /вебхук: Wrong response/);
  assert.ok(fresh.calls.some(c => c.includes('rollback')));
  const old = world({ webhook: { last_error_date: 100, last_error_message: 'old' } });
  await old.run();
  assert.ok(!old.calls.some(c => c.includes('rollback')));
});

test('staging: any branch, no CI or backup, staging database and deploy script', async () => {
  const w = world({ branch: 'ops/feature', dirty: true, pending: true, ci: [] });
  const r = await w.run(['--staging']);
  assert.equal(r.target, 'staging');
  assert.ok(w.calls.some(c => c.includes('migrations apply fc-altynka-staging --remote --env staging')));
  assert.ok(w.calls.includes('pnpm run deploy:staging'));
  assert.ok(!w.calls.includes('pnpm backup') && !w.calls.some(c => c.startsWith('gh ')));
  assert.ok(w.calls.filter(c => c.includes('wrangler')).every(c => c.endsWith('--env staging')));
});

test('parsers', () => {
  assert.deepEqual(parseArgs(['--staging', '--skip-ci']), { target: 'staging', skipCi: true });
  assert.throws(() => parseArgs(['--prod']), /Неизвестный аргумент/);
  assert.deepEqual(pendingMigrations('✅ No migrations to apply!'), []);
  assert.deepEqual(pendingMigrations('│ 0020_ops_incidents.sql │\n│ 0021_x.sql │'), ['0020_ops_incidents.sql', '0021_x.sql']);
  assert.deepEqual(parseDeploy(DEPLOY_OUT), { url: 'https://fc-altynka.example.workers.dev', version: NEW });
  assert.throws(() => parseDeploy('nothing'), /Не удалось прочитать/);
});
