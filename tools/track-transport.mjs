#!/usr/bin/env node
/** Проверяет, что browser transport отправляет JSON с корректным Content-Type. */
const storage = new Map();
let beacon = null;
let fetched = null;

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    HUB_TRACK_ENDPOINT: 'https://hub.example.test/ev',
    __hubUserId: '123',
    __hubStartParam: '',
  },
});
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k) => storage.has(k) ? storage.get(k) : null,
    setItem: (k, v) => storage.set(k, String(v)),
  },
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    sendBeacon(url, body) { beacon = { url, body }; return true; },
  },
});
Object.defineProperty(globalThis, 'location', {
  configurable: true,
  value: { search: '' },
});
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: async (url, opts) => { fetched = { url, opts }; return { ok: true }; },
});

const { track } = await import(`../js/track.js?transport=${Date.now()}`);
track('open_game', 'merge', 1);

let fails = 0;
function ok(cond, msg) {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fails++;
}

ok(beacon?.url === 'https://hub.example.test/ev', 'sendBeacon отправлен в /ev');
ok(beacon?.body instanceof Blob, 'sendBeacon получает Blob, а не text/plain строку');
ok(beacon?.body?.type === 'application/json', 'Blob имеет Content-Type application/json');
const parsed = beacon?.body ? JSON.parse(await beacon.body.text()) : null;
ok(parsed?.action === 'open_game' && parsed?.game === 'merge', 'JSON payload не повреждён');
ok(fetched === null, 'fetch fallback не используется при доступном sendBeacon');

if (fails) {
  console.error(`\nПровалено: ${fails}`);
  process.exit(1);
}
console.log('\nTransport аналитики корректен.');
