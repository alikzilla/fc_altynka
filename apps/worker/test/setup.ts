import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

const TABLES = ['player_votes', 'review_submissions', 'match_participants', 'match_reviews', 'skill_assessments', 'bill_lines', 'bills', 'team_assignments', 'signups', 'events', 'memberships', 'users', 'communities'];

beforeEach(async () => {
  await env.DB.batch(TABLES.map(t => env.DB.prepare(`DELETE FROM ${t}`)));
});
