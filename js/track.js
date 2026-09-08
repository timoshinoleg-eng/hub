/**
 * Сборщик событий. До согласия события полностью анонимны. После согласия
 * подписанный MAX initData передаётся серверу только для проверки identity;
 * в localStorage initData и сырой user_id никогда не сохраняются.
 */
const KEY = 'ofeliya_events';
const RAW_ENDPOINT = window.HUB_TRACK_ENDPOINT || '';
const ENDPOINT = RAW_ENDPOINT && (location.protocol !== 'https:' || /^https:\/\//i.test(RAW_ENDPOINT)) ? RAW_ENDPOINT : '';
const CONSENT_KEY = 'ofeliya_consent';

export const hasConsent = () => {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
};
export const setConsent = () => {
  try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* ignore */ }
};

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
    const wire = signed ? { ...ev, init_data: signed } : ev;
    const body = JSON.stringify(wire);
    if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    else fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
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
