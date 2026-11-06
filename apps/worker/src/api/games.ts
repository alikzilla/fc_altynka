import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireRole, type AppEnv } from '../auth/middleware';
import { getGameProtocol, startGameSession, type GameCommandResult } from '../domain/gameStart';
import { body, idParam } from './validate';

export const gamesApi = new Hono<AppEnv>();
const metaFields = { requestId: z.string().trim().min(1).max(100), expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) };
export const gameMetaBody = z.object(metaFields).strict();

export function gameReply(c: Context<AppEnv>, result: GameCommandResult) {
  if (result.kind === 'ok') return c.json({ protocol: result.protocol, appliedRevision: result.appliedRevision });
  return c.json({ error: result.kind, ...(result.reason ? { reason: result.reason } : {}) }, result.kind === 'invalid' ? 400 : result.kind === 'not_found' ? 404 : 409);
}

gamesApi.get('/events/:id/games', async c => {
  const id = idParam(c.req.param('id'));
  const protocol = id === null ? null : await getGameProtocol(c.get('deps'), id, c.get('role') !== 'player');
  return protocol ? c.json(protocol) : c.json({ error: 'not_found' }, 404);
});
gamesApi.post('/events/:id/games/start', requireRole('organizer'), body(gameMetaBody), async c => {
  const id = idParam(c.req.param('id'));
  return gameReply(c, id === null ? { kind: 'not_found' } : await startGameSession(c.get('deps'), id, c.get('user').id, c.req.valid('json')));
});
