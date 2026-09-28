/**
 * Оффлайн для оболочки хаба.
 *
 * Воркер модульный, и импорт статический, а не динамический. Причина в том, что
 * список прекэша и правила обхода живут в js/offline.js, который покрыт
 * unit-тестами: дублировать их здесь означало бы ровно то расхождение, которое
 * однажды привело к отдаче прошлой сборки в MAX WebView. Статический импорт
 * вычисляется до регистрации слушателей, а top-level await в service worker
 * запрещён — из-за него скрипт не стартует вовсе.
 */

/** Ревизия приезжает в query самого воркера: sw.js?v=<ревизия>. */
import { isBypassed, isRuntimeConfig, isVersioned, swCacheName, swPrecacheList, versionedFallback } from './js/offline.js';

const REV = new URLSearchParams(self.location.search).get('v') || 'dev';
const CACHE = swCacheName(REV);
const PRECACHE = swPrecacheList(REV);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // По одному, а не addAll: любой отсутствующий файл обрушил бы весь
    // install, и оффлайн не появился бы из-за одной второстепенной статики.
    const results = await Promise.allSettled(
      PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
    );
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? PRECACHE[i] : null))
      .filter(Boolean);
    if (failed.length) console.warn('[sw] не удалось прекэшировать', failed);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Имена кешей несут ревизию, поэтому всё, кроме текущего, — прошлые сборки.
    for (const name of await caches.keys()) {
      if (name.startsWith('hub-') && name !== CACHE) await caches.delete(name);
    }
    // claim() обязателен, а не украшение. Верхнеуровневая навигация
    // перехватывается только если воркер уже управляет страницей, поэтому без
    // claim первая же перезагрузка ушла бы в сеть и падала без связи. Опасения
    // на смешение ревизий здесь не оправдываются: кеш этого воркера содержит
    // только адреса его собственной сборки, а чужие ?v= уйдут в сеть.
    await self.clients.claim();
  })());
});

/** Ответ, который класть в кеш незачем. */
function cacheable(response) {
  return response && response.status === 200 && response.type === 'basic';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (isBypassed(request.url)) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isRuntimeConfig(request.url)) {
    event.respondWith(networkFirst(request, 'runtime-config.js'));
    return;
  }
  if (isVersioned(request.url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

/**
 * Конфигурация: всегда сначала сеть, при пропаже связи — последняя копия.
 *
 * Копия обновляется при каждом успешном ответе, поэтому cache-first здесь был бы
 * не просто «быстрее», а навсегда устаревшим: смена ревизии или бота до
 * устройства не дошла бы. А полный обход означал бы, что оффлайн не включается
 * никогда, потому что без ревизии из этого файла не грузится ни один модуль.
 */
async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (cacheable(fresh)) cache.put(cacheKey, fresh.clone());
    return fresh;
  } catch {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw new Error('offline: нет ни сети, ни кеша для ' + cacheKey);
  }
}

/**
 * Шелл: сначала сеть, кеш только как запасной путь.
 *
 * Обратный порядок здесь означал бы, что после релиза пользователь до
 * бесконечности открывает прошлую сборку до тех пор, пока не перезапустит WebView.
 *
 * Ответ кладётся по адресу самого запроса, а не по общему ключу `index.html`.
 * Навигацию воркера видят и iframe'ы игр, и общий ключ означал бы, что
 * последняя открытая игра затирала шелл в кеше: следующая загрузка меню
 * отдала бы документ игры. Ошибка молчаливая — проявлялась она только на
 * полном прогоне, когда один из iframe'ов успевал загрузиться раньше.
 */
async function handleNavigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (cacheable(fresh)) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return (await cache.match(request))
      || (await cache.match('index.html'))
      || offlineFallback();
  }
}

/** Адрес с `?v=` — иммутабельный, отдаём из кеша и не думаем. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (cacheable(fresh)) cache.put(request, fresh.clone());
  return fresh;
}

/**
 * Неверсионированная статика: мгновенно из кеша, обновляем в фоне.
 *
 * Фоновое обновление не блокирует ответ и не ждёт сеть: пользователь получает
 * картинку сразу, а следующий запуск уже будет со свежей версией.
 *
 * Если в кеше ничего нет, а сети нет тоже, делается одна последняя попытка —
 * взять из кеша версионированный адрес того же файла. Это спасает
 * внутримодульные статические импорты (`import './daily.js'` из engagement.js),
 * у которых нет `?v=`: без отката оффлайн падал на первом же из них.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (cacheable(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (hit) return hit;
  const fromNetwork = await network;
  if (fromNetwork) return fromNetwork;
  const fallback = await cache.match(versionedFallback(new URL(request.url).pathname, REV));
  if (fallback) return fallback;
  return new Response('', { status: 504, statusText: 'offline' });
}

function offlineFallback() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Нет связи</title>'
    + '<body style="font:16px system-ui;background:#090b14;color:#f7f8fb;padding:2rem">'
    + '<h1>Нет связи</h1><p>Открой хаб ещё раз, когда появится сеть.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
