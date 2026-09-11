#!/usr/bin/env node
const storage = new Map();
let beacon = null;
let fetched = null;
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  HUB_TRACK_ENDPOINT: 'https://hub.example.test/ev', HUB_CONFIG: { notificationsEnabled: true }, WebApp: { initData: 'signed-max-init-data' }, __hubStartParam: '',
} });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
} });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  sendBeacon(url, body) { beacon = { url, body }; return true; },
} });
Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '', protocol: 'https:' } });
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (url, opts) => {
  fetched = { url, opts }; return { ok: true, status: 200 };
} });

const { track, setConsent, subscribe, dump } = await import(`../js/track.js?transport=${Date.now()}`);
let fails = 0;
function ok(cond, msg) { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; }

track('open_game', 'merge', 1);
let parsed = beacon?.body ? JSON.parse(await beacon.body.text()) : null;
ok(beacon?.body instanceof Blob && beacon.body.type.startsWith('text/plain'), 'sendBeacon использует CORS-safelisted text/plain Blob');
ok(parsed?.action === 'open_game' && /^s_[A-Za-z0-9_-]{8,61}$/.test(parsed?.sid || ''), 'wire payload содержит ephemeral session id');
ok(!('init_data' in parsed) && !('uid_hash' in parsed), 'до consent wire payload не содержит MAX identity');
ok(!JSON.stringify(dump()).includes(parsed?.sid || '__none__'), 'session id не сохраняется в localStorage history');
ok(!JSON.stringify(dump()).includes('signed-max-init-data'), 'localStorage не содержит initData');

setConsent();
track('finish', 'merge', 10);
parsed = beacon?.body ? JSON.parse(await beacon.body.text()) : null;
ok(parsed?.init_data === 'signed-max-init-data', 'после consent подписанный initData передаётся для server validation');
ok(!JSON.stringify(dump()).includes('signed-max-init-data'), 'даже после consent initData не сохраняется локально');

await subscribe('merge');
const subBody = fetched ? JSON.parse(fetched.opts.body) : null;
ok(fetched?.url === 'https://hub.example.test/sub', 'subscribe идёт в /sub');
ok(fetched?.opts?.credentials === 'omit', 'fetch transport не отправляет ambient credentials');
ok(subBody?.init_data === 'signed-max-init-data' && !('user_id' in subBody), 'subscribe не принимает self-asserted user_id');

if (fails) { console.error(`\nПровалено: ${fails}`); process.exit(1); }
console.log('\nPrivacy/transport contract аналитики корректен.');
