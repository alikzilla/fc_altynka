export interface TgWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  allows_write_to_pm?: boolean;
}

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

function hexToBytes(h: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(h)) return null;
  return Uint8Array.from(h.match(/../g)!.map(x => parseInt(x, 16)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Проверка подписи initData мини-аппа по документации Telegram:
 * secret = HMAC_SHA256("WebAppData", botToken); hash = HMAC_SHA256(secret, data_check_string).
 */
export async function verifyInitData(
  raw: string,
  botToken: string,
  nowSec: number,
  maxAgeSec = 86_400,
): Promise<TgWebAppUser | null> {
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  const given = hash ? hexToBytes(hash) : null;
  if (!given) return null;
  params.delete('hash');
  const dcs = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const expected = new Uint8Array(await hmac(secret, dcs));
  if (!timingSafeEqual(expected, given)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSec - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') ?? '') as TgWebAppUser;
    return typeof user?.id === 'number' && typeof user.first_name === 'string' ? user : null;
  } catch {
    return null;
  }
}
