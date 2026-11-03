import { GrammyError } from 'grammy';
import { classifyTgError, TgMessageGone, TgRateLimited, TgRejected } from '../../src/telegram/client';

const tgErr = (error_code: number, description: string, parameters = {}) =>
  new GrammyError('x', { ok: false, error_code, description, parameters }, 'editMessageText', {});

test('telegram errors are sorted into retry, gone, rejected', () => {
  expect(classifyTgError(tgErr(429, 'Too Many Requests', { retry_after: 7 }))).toMatchObject({ retryAfterSec: 7 });
  expect(classifyTgError(tgErr(429, 'Too Many Requests'))).toBeInstanceOf(TgRateLimited);
  expect(classifyTgError(tgErr(400, 'Bad Request: message to edit not found'))).toBeInstanceOf(TgMessageGone);
  expect(classifyTgError(tgErr(400, "Bad Request: message can't be edited"))).toBeInstanceOf(TgMessageGone);
  expect(classifyTgError(tgErr(400, 'Bad Request: text must be non-empty'))).toBeInstanceOf(TgRejected);
  expect(classifyTgError(tgErr(403, 'Forbidden: bot was kicked from the supergroup chat'))).toBeInstanceOf(TgRejected);
  const net = new Error('network down');
  expect(classifyTgError(net)).toBe(net);
  expect(classifyTgError(tgErr(502, 'Bad Gateway'))).toBeInstanceOf(GrammyError);
});
