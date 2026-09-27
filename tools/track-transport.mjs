#!/usr/bin/env node
const storage = new Map();
let beacon = null;
let fetched = null;
let beaconUrl = null;
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  HUB_TRACK_ENDPOINT: 'https://hub.example.test/ev', WebApp: { initData: 'signed-max-init-data' },
  __hubStartParam: '', HUB_CONFIG: { notificationsEnabled: true },
} });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
} });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  sendBeacon(url, body) { beacon = { url, body }; beaconUrl = url; return true; },
} });
Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '', protocol: 'https:' } });
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (url, opts) => {
  fetched = { url, opts }; return { ok: true, status: 200 };
} });

const { track, setConsent, subscribe, revokeConsent, clearConsent, hasConsent, subscriptionAvailable, dump } =
  await import(`../js/track.js?transport=${Date.now()}`);

let fails = 0;
function ok(cond, msg) { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; }


// Подписка fail-closed по обоим условиям: без работающего endpoint кнопка
// показывалась бы и получала 503.
ok(subscriptionAvailable() === true, 'подписка доступна при включённых уведомлениях и настроенном endpoint');
window.HUB_CONFIG.notificationsEnabled = false;
ok(subscriptionAvailable() === false, 'подписка скрыта, когда notificationsEnabled=false');
ok((await subscribe('merge')).reason === 'no_consent', 'subscribe() требует согласия раньше, чем проверяет флаг');
window.HUB_CONFIG.notificationsEnabled = true;
ok(subscriptionAvailable() === true, 'подписка снова доступна после включения');

track('open_game', 'merge', 1);
let parsed = beacon?.body ? JSON.parse(await beacon.body.text()) : null;
ok(beacon?.body instanceof Blob && beacon.body.type.startsWith('text/plain'), 'sendBeacon использует CORS-safelisted text/plain Blob');
ok(parsed?.action === 'open_game' && /^s_[A-Za-z0-9_-]{8,61}$/.test(parsed?.sid || ''), 'wire payload содержит ephemeral session id');
ok(!('init_data' in parsed) && !('uid_hash' in parsed), 'до consent wire payload не содержит MAX identity');
ok(!JSON.stringify(dump()).includes(parsed?.sid || '__none__'), 'session id не сохраняется в локальном буфере');
ok(!JSON.stringify(dump()).includes('signed-max-init-data'), 'локальный буфер не содержит initData');
ok(!storage.has('ofeliya_events'), 'полная история событий больше не пишется в localStorage на каждое действие');

setConsent();
ok(hasConsent() === true, 'согласие фиксируется');
track('finish', 'merge', 10);
parsed = beacon?.body ? JSON.parse(await beacon.body.text()) : null;
ok(parsed?.init_data === 'signed-max-init-data', 'после consent подписанный initData передаётся для server validation');
ok(!JSON.stringify(dump()).includes('signed-max-init-data'), 'даже после consent initData не сохраняется локально');
ok(JSON.parse(storage.get('hub_consent_v1')).v !== undefined, 'факт согласия хранит версию текста согласия');

// С выключенными уведомлениями подписка обязана быть недоступна даже при
// согласии: раньше здесь показывалась кнопка, которая получала 503.
window.HUB_CONFIG.notificationsEnabled = false;
ok((await subscribe('merge')).reason === 'notifications_disabled', 'subscribe() отказывает при выключенных уведомлениях');
window.HUB_CONFIG.notificationsEnabled = true;

await subscribe('merge');
const subBody = fetched ? JSON.parse(fetched.opts.body) : null;
ok(fetched?.url === 'https://hub.example.test/sub', 'subscribe идёт в /sub');
ok(fetched?.opts?.credentials === 'omit', 'fetch transport не отправляет ambient credentials');
ok(subBody?.init_data === 'signed-max-init-data' && !('user_id' in subBody), 'subscribe не принимает self-asserted user_id');
ok(subBody?.consent_text !== undefined, 'subscribe передаёт версию текста согласия как доказательство');

// Отзыв согласия должен стирать локальный факт и уведомлять сервер.
beacon = null; fetched = null;
const revoked = await revokeConsent();
ok(revoked.ok === true && hasConsent() === false, 'отзыв согласия стирает локальный факт');
ok(fetched?.url === 'https://hub.example.test/revoke', 'отзыв уходит на /revoke');
ok(JSON.parse(fetched.opts.body).init_data === 'signed-max-init-data', 'отзыв аутентифицирован подписанным initData');
track('open_game', 'merge', 2);
parsed = beacon?.body ? JSON.parse(await beacon.body.text()) : null;
ok(!('init_data' in parsed), 'после отзыва события снова анонимны');

if (fails) { console.error(`\nПровалено: ${fails}`); process.exit(1); }
console.log('\nPrivacy/transport contract аналитики корректен.');

