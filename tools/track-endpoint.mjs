#!/usr/bin/env node
/**
 * Контракт разрешения analytics endpoint.
 *
 * Мотивация: раньше условие принимало только абсолютный HTTPS URL (или любой
 * URL на http-странице). Same-origin относительный путь — /hub-api/ev в
 * production-топологии — отбрасывался, и аналитика молча выключалась, хотя
 * оператор её настроил. Обратная ошибка тоже опасна: http:// endpoint на
 * https:// странице принимался и терялся в браузере без диагностики.
 *
 * Модуль кеширует ENDPOINT при импорте, поэтому каждый случай проверяется
 * отдельным импортом с уникальным query — иначе сработает module cache.
 */
import assert from 'node:assert/strict';

let fails = 0;
function ok(cond, msg) { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; }

function stubBrowser({ endpoint, protocol }) {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    HUB_TRACK_ENDPOINT: endpoint, WebApp: { initData: '' }, __hubStartParam: '',
  } });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '', protocol } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem: () => {},
  } });
  let beacon = null;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    sendBeacon: (url) => { beacon = url; return true; },
  } });
  return () => beacon;
}

async function resolvedEndpoint({ endpoint, protocol }) {
  const getBeacon = stubBrowser({ endpoint, protocol });
  const mod = await import(`../js/track.js?ep=${encodeURIComponent(String(endpoint))}-${protocol}-${Math.random()}`);
  mod.track('open_bot');
  return getBeacon();
}

ok(await resolvedEndpoint({ endpoint: '/hub-api/ev', protocol: 'https:' }) === '/hub-api/ev',
  'same-origin относительный путь принимается на https-странице');
ok(await resolvedEndpoint({ endpoint: '/hub-api/ev', protocol: 'http:' }) === '/hub-api/ev',
  'same-origin относительный путь принимается на http-странице');
ok(await resolvedEndpoint({ endpoint: 'https://api.example.ru/ev', protocol: 'https:' }) === 'https://api.example.ru/ev',
  'абсолютный HTTPS endpoint принимается');
ok(await resolvedEndpoint({ endpoint: 'http://api.example.ru/ev', protocol: 'https:' }) === null,
  'смешанное содержимое http-endpoint на https-странице отбрасывается, а не теряется молча в браузере');
ok(await resolvedEndpoint({ endpoint: 'http://127.0.0.1:8787/ev', protocol: 'http:' }) === 'http://127.0.0.1:8787/ev',
  'http-endpoint допускается на http-странице (локальная разработка)');
ok(await resolvedEndpoint({ endpoint: '', protocol: 'https:' }) === null,
  'пустой endpoint остаётся валидным состоянием «аналитика не настроена»');

// runtime-config.js обязан задавать endpoint: без него браузерные события
// не уходят вообще и /stats остаётся пустым при живом server.
const { readFileSync } = await import('node:fs');
const { join, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const cfg = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'runtime-config.js'), 'utf8');
assert.match(cfg, /window\.HUB_TRACK_ENDPOINT\s*=\s*'\/hub-api\/ev'/, 'runtime-config задаёт same-origin endpoint по умолчанию');

if (fails) { console.error(`\nПровалено: ${fails}`); process.exit(1); }
console.log('\nAnalytics endpoint resolution contract: ok');
