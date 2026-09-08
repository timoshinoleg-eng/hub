import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_MAX_AGE_SECONDS = 60 * 60;
const FUTURE_SKEW_SECONDS = 60;

function decodeValue(raw) {
  return decodeURIComponent(String(raw).replace(/\+/g, ' '));
}

function equalHex(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(String(a)) || !/^[a-f0-9]{64}$/i.test(String(b))) return false;
  const aa = Buffer.from(String(a), 'hex');
  const bb = Buffer.from(String(b), 'hex');
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

/**
 * Проверяет MAX WebApp initData по алгоритму dev.max.ru/docs/webapps/validation.
 * initDataUnsafe никогда не является источником доверенной identity.
 * По умолчанию принимаются данные не старше одного часа — это рекомендуемое
 * MAX окно свежести; при необходимости его можно сузить через env.
 */
export function verifyMaxInitData(raw, {
  botToken = process.env.BOT_TOKEN || '',
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = Number(process.env.HUB_MAX_AUTH_AGE_SECONDS || DEFAULT_MAX_AGE_SECONDS),
} = {}) {
  if (!botToken) return { ok: false, reason: 'bot_token_missing' };
  if (typeof raw !== 'string' || !raw || raw.length > 16_384) return { ok: false, reason: 'bad_init_data' };

  const pairs = [];
  for (const part of raw.split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    if (i <= 0) return { ok: false, reason: 'bad_pair' };
    pairs.push([part.slice(0, i), part.slice(i + 1)]);
  }

  const seen = new Set();
  for (const [key] of pairs) {
    if (seen.has(key)) return { ok: false, reason: 'duplicate_key' };
    seen.add(key);
  }

  const hashPair = pairs.find(([key]) => key === 'hash');
  if (!hashPair) return { ok: false, reason: 'hash_missing' };

  let decoded;
  try {
    decoded = pairs.map(([key, value]) => [key, decodeValue(value)]);
  } catch {
    return { ok: false, reason: 'bad_encoding' };
  }

  const originalHash = decoded.find(([key]) => key === 'hash')?.[1] || '';
  const launchParams = decoded
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // HMAC_SHA256("WebAppData", BOT_TOKEN), затем HMAC_SHA256(secret_key, launch_params).
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(launchParams).digest('hex');
  if (!equalHex(expectedHash, originalHash)) return { ok: false, reason: 'bad_hash' };

  const map = Object.fromEntries(decoded.filter(([key]) => key !== 'hash'));
  const authDate = Number(map.auth_date);
  if (!Number.isFinite(authDate)) return { ok: false, reason: 'bad_auth_date' };
  if (authDate > nowSeconds + FUTURE_SKEW_SECONDS) return { ok: false, reason: 'auth_date_future' };
  if (Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0 && nowSeconds - authDate > maxAgeSeconds) {
    return { ok: false, reason: 'auth_date_expired' };
  }

  let user;
  try { user = JSON.parse(map.user || 'null'); } catch { return { ok: false, reason: 'bad_user' }; }
  const userId = Number(user?.id ?? user?.user_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return { ok: false, reason: 'bad_user_id' };

  return {
    ok: true,
    user: { ...user, id: userId },
    authDate,
    queryId: map.query_id || '',
    startParam: map.start_param || '',
  };
}
