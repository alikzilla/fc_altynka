import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { identityMiddleware, scopeCommunity, type AppEnv } from '../auth/middleware';
import { communitiesApi } from './communities';
import { getDb } from '../db/client';
import { billLines, bills, events, signups } from '../db/schema';
import type { Deps } from '../domain/events';
import type { Env } from '../env';
import { doSyncPort } from '../sync/port';
import { eventsApi } from './events';
import { membersApi } from './members';
import { teamsApi } from './teams';
import { billsApi } from './bills';
import { notificationsApi } from './notifications';
import { ratingsApi } from './ratings';
import { gamesApi } from './games';
import { idParam } from './validate';

const defaultDeps = (env: Env): Deps => ({ db: getDb(env.DB), now: Date.now(), sync: doSyncPort(env) });
let depsFactory: (env: Env) => Deps = defaultDeps;

export function setDepsFactoryForTests(f: ((env: Env) => Deps) | null): void {
  depsFactory = f ?? defaultDeps;
}

type C = Context<AppEnv>;
const param = (c: C, name: string) => idParam(c.req.param(name) ?? '');
const first = async <T>(rows: Promise<T[]>): Promise<T | null> => (await rows)[0] ?? null;

/** Group of the object named in the path; null when the object does not exist. */
const groupOf = {
  event: async (c: C) => {
    const id = param(c, 'id');
    return id === null ? null : (await first(c.get('deps').db.select({ g: events.communityId }).from(events).where(eq(events.id, id))))?.g ?? null;
  },
  bill: async (c: C) => {
    const id = param(c, 'id');
    return id === null ? null : (await first(c.get('deps').db.select({ g: events.communityId }).from(bills)
      .innerJoin(events, eq(events.id, bills.eventId)).where(eq(bills.id, id))))?.g ?? null;
  },
  billLine: async (c: C) => {
    const id = param(c, 'id');
    return id === null ? null : (await first(c.get('deps').db.select({ g: events.communityId }).from(billLines)
      .innerJoin(bills, eq(bills.id, billLines.billId)).innerJoin(events, eq(events.id, bills.eventId)).where(eq(billLines.id, id))))?.g ?? null;
  },
  signup: async (c: C) => {
    const id = param(c, 'id');
    return id === null ? null : (await first(c.get('deps').db.select({ g: events.communityId }).from(signups)
      .innerJoin(events, eq(events.id, signups.eventId)).where(eq(signups.id, id))))?.g ?? null;
  },
  /** Group management names its group explicitly: `?communityId=`. */
  query: async (c: C) => idParam(c.req.query('communityId') ?? ''),
};

/** A person who left the group may still mark their own debt as paid; nothing else. */
const ownLine = async (c: C) => {
  const id = param(c, 'id');
  return id !== null && !!(await first(c.get('deps').db.select({ id: billLines.id }).from(billLines)
    .where(and(eq(billLines.id, id), eq(billLines.userId, c.get('user').id)))));
};
const ownBillPayment = async (c: C) => {
  const id = param(c, 'id');
  if (id === null || c.req.method !== 'POST' || !/\/bills\/\d+\/paid$/.test(c.req.path)) return false;
  return !!(await first(c.get('deps').db.select({ id: billLines.id }).from(billLines)
    .where(and(eq(billLines.billId, id), eq(billLines.userId, c.get('user').id)))));
};

export const api = new Hono<AppEnv>();
api.use('*', identityMiddleware(env => depsFactory(env)));
// Person-scoped routes (/me, /events list, /matches, /notifications, /players) need no group.
// Object-scoped routes resolve the group from the object; a foreign object looks like a missing one.
// Hono's `/events/:id/*` also matches `/events/:id`, but not `/events` (list and create).
api.use('/events/:id/*', scopeCommunity(groupOf.event));
api.use('/bills/:id/*', scopeCommunity(groupOf.bill, 404, ownBillPayment));
api.use('/bill-lines/:id', scopeCommunity(groupOf.billLine, 404, ownLine));
api.use('/signups/:id', scopeCommunity(groupOf.signup));
api.use('/members', scopeCommunity(groupOf.query, 403));
api.use('/members/:userId', scopeCommunity(groupOf.query, 403));
api.route('/', communitiesApi);
api.route('/', eventsApi);
api.route('/', membersApi);
api.route('/', teamsApi);
api.route('/', billsApi);
api.route('/', notificationsApi);
api.route('/', ratingsApi);
api.route('/', gamesApi);
