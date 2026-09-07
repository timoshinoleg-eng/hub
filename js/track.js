/**
 * Сборщик событий. 5 полей: user_id, game, action, value, ts.
 *
 * Свой, а не Umami / Plausible CE / Matomo: все три — AGPL или GPL,
 * их нельзя встроить в закрытый продукт. Свой собиратель дешевле юрэкспертизы.
 *
 * Пока endpoint не задан, события складываются в localStorage и видны
 * в консоли — этого достаточно для софт-лонча на 100–300 человек.
 */

const KEY = 'ofeliya_events';
const ENDPOINT = window.HUB_TRACK_ENDPOINT || '';
const CONSENT_KEY = 'ofeliya_consent';

/**
 * Сырой идентификатор пользователя не сохраняется в события: сервер
 * хеширует его HMAC-ом с солью. Здесь мы его только передаём по HTTPS.
 */
export const hasConsent = () => {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
};
export const setConsent = () => {
  try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* ignore */ }
};

export function track(action, game = null, value = null) {
  const ev = {
    uid_hash: window.__hubUserId || 'anon',
    game,
    action,
    value,
    ts: Date.now(),
    sp: window.__hubStartParam || '',
    consent: hasConsent(),
  };

  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '[]');
    all.push(ev);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-2000)));
  } catch (e) { /* приватный режим — не критично */ }

  if (ENDPOINT) {
    const body = JSON.stringify(ev);
    navigator.sendBeacon
      ? navigator.sendBeacon(ENDPOINT, body)
      : fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {});
  }

  if (location.search.includes('debug=1')) console.log('[track]', ev);
  return ev;
}

/** Подписка на «уведомить о запуске». Нужен реальный user_id — иначе бот
 *  не сможет отправить сообщение. Отправляем только при явном согласии. */
export async function subscribe(gameId = null) {
  if (!hasConsent()) return { ok: false, reason: 'no_consent' };
  const userId = window.__hubUserId || '';
  const numeric = /^\d+$/.test(String(userId)) ? Number(userId) : null;
  if (!numeric) return { ok: false, reason: 'no_user_id' };

  try {
    const r = await fetch(ENDPOINT.replace(/\/ev\/?$/, '/sub'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: numeric, game: gameId, consent: true }),
    });
    return { ok: r.ok };
  } catch (e) {
    return { ok: false, reason: 'network' };
  }
}

export function dump() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}

/** Выгрузка в CSV — заменяет дашборд на первые две недели. */
export function toCsv() {
  const rows = dump();
  if (!rows.length) return '';
  const head = Object.keys(rows[0]).join(',');
  return [head, ...rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
}

window.__hubToCsv = toCsv;
