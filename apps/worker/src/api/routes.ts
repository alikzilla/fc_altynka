import { Hono } from 'hono';
import { authMiddleware, type AppEnv } from '../auth/middleware';
import { getDb } from '../db/client';
import type { Deps } from '../domain/events';
import type { Env } from '../env';
import { doSyncPort } from '../sync/port';
import { eventsApi } from './events';
import { membersApi } from './members';
import { teamsApi } from './teams';

const defaultDeps = (env: Env): Deps => ({ db: getDb(env.DB), now: Date.now(), sync: doSyncPort(env) });
let depsFactory: (env: Env) => Deps = defaultDeps;

export function setDepsFactoryForTests(f: ((env: Env) => Deps) | null): void {
  depsFactory = f ?? defaultDeps;
}

export const api = new Hono<AppEnv>();
api.use('*', authMiddleware(env => depsFactory(env)));
api.route('/', eventsApi);
api.route('/', membersApi);
api.route('/', teamsApi);
