/**
 * Сборщик событий. До согласия события полностью анонимны. После согласия
 * подписанный MAX initData передаётся серверу только для проверки identity;
 * в localStorage initData, сырой user_id и session id никогда не сохраняются.
 */
const KEY = 'ofeliya_events';
const RAW_ENDPOINT = window.HUB_TRACK_ENDPOINT || '';
const ENDPOINT = RAW_ENDPOINT && (location.protocol !== 'https:' || /^https:\/\//i.test(RAW_ENDPOINT)) ? RAW_ENDPOINT : '';
const CONSENT_KEY = 'ofeliya_consent';
const SESSION_ID = (() => {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `s_${uuid}`;
  } catch { /* ignore */ }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
})();

export const hasConsent = () => {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
};
export const setConsent = () => {
  try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* ignore */ }
};
/** Whether this deployment has a usable Hub subscription backend. */
export const subscriptionAvailable = () => Boolean(ENDPOINT);

function initData() {
  const raw = window.WebApp?.initData;
  return typeof raw === 'string' ? raw : '';
}

export function track(action, game = null, value = null) {
  const ev = { game, action, value, ts: Date.now(), sp: window.__hubStartParam || '' };
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '[]');
    all.push(ev);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-2000)));
  } catch { /* private mode */ }

  if (ENDPOINT) {
    const signed = hasConsent() ? initData() : '';
    const wire = { ...ev, sid: SESSION_ID, ...(signed ? { init_data: signed } : {}) };
    const body = JSON.stringify(wire);
    if (navigator.sendBeacon) {
      // text/plain остаётся CORS-safelisted и не требует preflight при unload.
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }
  if (location.search.includes('debug=1')) console.log('[track]', ev);
  return ev;
}

export async function subscribe(gameId = null) {
  if (!hasConsent()) return { ok: false, reason: 'no_consent' };
  if (!ENDPOINT) return { ok: false, reason: RAW_ENDPOINT ? 'insecure_endpoint' : 'no_endpoint' };
  const signed = initData();
  if (!signed) return { ok: false, reason: 'no_auth' };
  try {
    const r = await fetch(ENDPOINT.replace(/\/ev\/?$/, '/sub'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ init_data: signed, game: gameId, consent: true }),
    });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export function dump() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function toCsv() {
  const rows = dump();
  if (!rows.length) return '';
  const head = Object.keys(rows[0]).join(',');
  return [head, ...rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
}
window.__hubToCsv = toCsv;