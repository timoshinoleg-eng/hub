/**
 * Сборщик событий. До согласия события полностью анонимны. После согласия
 * подписанный MAX initData передаётся серверу только для проверки identity;
 * в localStorage initData, сырой user_id и session id никогда не сохраняются.
 *
 * Дополнительно: подписка, отзыв согласия и клиентские ошибки проходят через
 * тот же транспорт, поэтому сервер получает полную картину без отдельного
 * SDK-бэкенда.
 */
const KEY = 'hub_client_errors';
const RAW_ENDPOINT = window.HUB_TRACK_ENDPOINT || '';

/**
 * Endpoint принимается, если он same-origin относительный путь или
 * абсолютный HTTPS URL. Смешанное содержимое (http:// endpoint на https://
 * странице) отбрасывается: иначе браузер всё равно заблокирует запрос,
 * а мы потеряем события без диагностики.
 *
 * Пустое значение означает «аналитика не настроена» и остаётся валидным
 * состоянием для phase-1 статики без server.
 */
function resolveEndpoint(raw) {
  if (!raw) return '';
  if (raw.startsWith('/')) return raw;
  if (location.protocol !== 'https:') return raw;
  return /^https:\/\//i.test(raw) ? raw : '';
}
const ENDPOINT = resolveEndpoint(RAW_ENDPOINT);

/**
 * Версия согласия записывается вместе с фактом согласия. Без неё нельзя
 * доказать, на какую формулировку человек ответил «да»: смена текста политики
 * должна делать старое согласие недействительным, а не молча его продлевать.
 */
const CONSENT_KEY = 'hub_consent_v1';
const CONSENT_TEXT_ID = 'notify-2026-09';
export const CONSENT_VERSION = CONSENT_TEXT_ID;

const SESSION_ID = (() => {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `s_${uuid}`;
  } catch { /* ignore */ }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
})();

/**
 * Локальный буфер событий.
 *
 * Раньше каждое событие переписывало весь массив из localStorage: JSON.parse
 * плюс JSON.stringify до 2000 записей и синхронная запись ~250 КБ на каждое
 * действие. При этом буфер никуда не отправлялся — его единственный читатель
 * это window.__hubToCsv в консоли разработчика. Итого постоянный jank на слабых
 * Android ради данных, которые никто не смотрит.
 *
 * Теперь в памяти живёт кольцевой буфер (для отладки и экспорта), а в
 * localStorage попадает только короткий хвост ошибок — то, что действительно
 * нужно пережить перезагрузку.
 */
const RING_MAX = 200;
const ring = [];

export const consentRecord = () => {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.v === CONSENT_VERSION ? parsed : null;
  } catch { return null; }
};

export const hasConsent = () => consentRecord() !== null;

export const setConsent = (version = CONSENT_VERSION) => {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: version, at: Date.now() }));
  } catch { /* private mode */ }
};

/**
 * Отзыв согласия на устройстве. Сбрасывает локальный факт согласия; сетевой
 * отзыв (POST /revoke) вызывает revokeConsent(), который дополнительно
 * обращается к серверу, чтобы оператор прекратил хранение.
 */
export const clearConsent = () => {
  try { localStorage.removeItem(CONSENT_KEY); } catch { /* private mode */ }
};

function initData() {
  const raw = window.WebApp?.initData;
  return typeof raw === 'string' ? raw : '';
}

function post(path, payload) {
  if (!ENDPOINT) return null;
  const target = path === 'ev' ? ENDPOINT : ENDPOINT.replace(/\/ev\/?$/, `/${path}`);
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon && path === 'ev') {
      // text/plain остаётся CORS-safelisted и не требует preflight при unload.
      const queued = navigator.sendBeacon(target, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
      if (queued) return { transport: 'beacon' };
    }
  } catch { /* fall through to fetch */ }
  return fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    body,
    keepalive: path === 'ev',
  }).then((r) => ({ transport: 'fetch', status: r.status, ok: r.ok })).catch(() => ({ transport: 'fetch', failed: true }));
}

export function track(action, game = null, value = null) {
  const ev = { game, action, value, ts: Date.now(), sp: window.__hubStartParam || '' };
  ring.push(ev);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);

  if (ENDPOINT) {
    const signed = hasConsent() ? initData() : '';
    const wire = { ...ev, sid: SESSION_ID, ...(signed ? { init_data: signed } : {}) };
    post('ev', wire);
  }
  if (location.search.includes('debug=1')) console.log('[track]', ev);
  return ev;
}

/**
 * Доступна ли подписка. Fail-closed по обоим условиям: без работающего
 * analytics endpoint кнопка подписки показывалась бы и получала 503.
 * Раньше проверялся только флаг конфигурации.
 */
export const subscriptionAvailable = () =>
  Boolean(ENDPOINT) && window.HUB_CONFIG?.notificationsEnabled === true;

export async function subscribe(gameId = null) {
  if (!hasConsent()) return { ok: false, reason: 'no_consent' };
  if (!ENDPOINT) return { ok: false, reason: RAW_ENDPOINT ? 'insecure_endpoint' : 'no_endpoint' };
  if (window.HUB_CONFIG?.notificationsEnabled !== true) return { ok: false, reason: 'notifications_disabled' };
  const signed = initData();
  if (!signed) return { ok: false, reason: 'no_auth' };
  try {
    const r = await fetch(ENDPOINT.replace(/\/ev\/?$/, '/sub'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ init_data: signed, game: gameId, consent: true, consent_text: CONSENT_VERSION }),
    });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Отзыв согласия: стирает локальный факт и просит сервер удалить связанные
 * данные. Отличается от согласия тем, что необратим для текущей формулировки:
 * согласиться заново можно только явным повторным действием.
 */
export async function revokeConsent() {
  const signed = initData();
  const result = signed ? await post('revoke', { init_data: signed }) : { ok: false, reason: 'no_auth' };
  clearConsent();
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  return { ok: true, serverNotified: Boolean(result && !result.failed) };
}

// ── Клиентские ошибки ──────────────────────────────────────────────────────
//
// До этого в проекте не было ни одного сигнала о том, что сломалось в
// браузере: PRODUCTION_RUNBOOK §6 и SOFT_LAUNCH_KPI §6 требуют отслеживать
// «client/runtime complaints отдельно», но отслеживать было нечем, и пустая
// воронка была неотличима от «всё хорошо, но никто не открывает».
//
// Текст ошибки не отправляется целиком и не включает URL с параметрами:
// достаточно типа, сообщения и контекста. Персональных данных здесь нет.

const ERROR_TYPES = new Set(['TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'Error']);
let lastError = { message: '', at: 0 };
let errorHookInstalled = false;

function classify(err) {
  const name = String(err?.name || 'Error');
  return {
    kind: ERROR_TYPES.has(name) ? name : 'Error',
    message: String(err?.message || err || '').slice(0, 200),
  };
}

function reportError(kind, message, fatal) {
  const now = Date.now();
  // Не более одной записи в 10 секунд на одинаковое сообщение: иначе одна
  // ошибка в цикле превращается в тысячу событий и выжигает rate limit.
  if (message === lastError.message && now - lastError.at < 10000) return;
  lastError = { message, at: now };
  const entry = { ts: now, kind, message, fatal: !!fatal, view: location.pathname, sid: SESSION_ID };
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '[]');
    all.push(entry);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-20)));
  } catch { /* private mode */ }
  // Ошибки отправляем всегда, даже без согласия: они не содержат identity,
  // а без них диагностика проделана вслепую.
  if (ENDPOINT) post('ev', { action: 'client_error', game: null, value: null, ts: now, sid: SESSION_ID, meta: { kind, message, fatal: !!fatal } });
}

export function installErrorReporting() {
  if (errorHookInstalled) return;
  errorHookInstalled = true;
  addEventListener('error', (e) => {
    if (e?.target && e.target !== globalThis && e.target.tagName) {
      // Незагруженный ресурс: <script>/<img>/<link>. Сообщение приходит в
      // отдельном событии error у элемента, а не как ErrorEvent.
      const tag = String(e.target.tagName).toLowerCase();
      if (['script', 'img', 'link'].includes(tag)) reportError('resource_error', `не загружен <${tag}> ${e.target.src || e.target.href || ''}`, false);
      return;
    }
    const c = classify(e?.error || e);
    reportError(c.kind, c.message, true);
  });
  addEventListener('unhandledrejection', (e) => {
    const reason = e?.reason;
    const c = classify(reason instanceof Error ? reason : { name: 'UnhandledRejection', message: reason });
    reportError(c.kind, c.message, true);
  });
}

export function clientErrors() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function dump() {
  return ring.slice();
}
export function toCsv() {
  const rows = dump();
  if (!rows.length) return '';
  const head = Object.keys(rows[0]).join(',');
  return [head, ...rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
}
window.__hubToCsv = toCsv;
