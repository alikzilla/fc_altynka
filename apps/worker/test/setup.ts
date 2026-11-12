import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

const TABLES = ['venues', 'availability_days', 'feed_hidden', 'feed_reactions', 'feed_posts', 'player_votes', 'review_submissions', 'match_participants', 'match_reviews', 'skill_assessments', 'bill_lines', 'bills', 'team_assignments', 'signups', 'events', 'memberships', 'users', 'communities'];

beforeEach(async () => {
  // Remove the parent first: started-session guards deliberately prevent deleting its roster.
  // Deferral applies only to this cleanup transaction; all children are gone before commit.
  await env.DB.batch([
    env.DB.prepare('PRAGMA defer_foreign_keys = ON'),
    env.DB.prepare('DELETE FROM events'),
    ...TABLES.filter(t => t !== 'events').map(t => env.DB.prepare(`DELETE FROM ${t}`)),
  ]);
});
