import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requireRole, type AppEnv } from '../auth/middleware';
import { getGameProtocol, startGameSession, type GameCommandResult } from '../domain/gameStart';
import { body, idParam } from './validate';
import { recordGameResult, editGameResult, undoLastGame } from '../domain/games';

export const gamesApi = new Hono<AppEnv>();
const metaFields = { requestId: z.string().trim().min(1).max(100), expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) };
export const gameMetaBody = z.object(metaFields).strict();
const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const resultBody = gameMetaBody.extend({
  score: z.tuple([safeInteger, safeInteger]),
  scorers: z.array(z.object({ signupId: safeInteger.positive(), goals: safeInteger.positive() }).strict()).max(100),
  firstRestTeamIndex: z.number().int().min(0).max(2).optional(),
}).strict();

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
gamesApi.post('/events/:id/games/results', requireRole('organizer'), body(resultBody), async c => {
  const id = idParam(c.req.param('id'));
  return gameReply(c, id === null ? { kind: 'not_found' } : await recordGameResult(c.get('deps'), id, c.get('user').id, c.req.valid('json'), c.req.valid('json')));
});
gamesApi.patch('/events/:id/games/results/:gameId', requireRole('organizer'), body(resultBody), async c => {
  const id = idParam(c.req.param('id'));
  return gameReply(c, id === null ? { kind: 'not_found' } : await editGameResult(c.get('deps'), id, c.req.param('gameId'), c.get('user').id, c.req.valid('json'), c.req.valid('json')));
});
gamesApi.post('/events/:id/games/undo', requireRole('organizer'), body(gameMetaBody), async c => {
  const id = idParam(c.req.param('id'));
  return gameReply(c, id === null ? { kind: 'not_found' } : await undoLastGame(c.get('deps'), id, c.get('user').id, c.req.valid('json')));
});
