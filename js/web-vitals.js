/**
 * Сбор Web Vitals в хабе.
 *
 * Зачем. У проекта не было ни одного реально-пользовательского
 * производительностного сигнала, при том что всё приложение — это 12 игр в
 * iframe: старт каждого кадра и есть то место, где живут все семнадцать
 * коммитов про кеш модулей. SOFT_LAUNCH_KPI §6 просит отслеживать клиентские
 * проблемы, но «клиентские» в первую очередь означают медленные.
 *
 * Модуль вендорен локально: политика проекта запрещает внешние runtime-ресурсы,
 * а CDN в WebView означал бы ещё одну точку отказа и лишний preflight.
 *
 * Метрики не уходят в analytics отдельным каналом: они пишутся в тот же
 * буфер ошибок и уходят событием client_error, поэтому отдельная инфраструктура
 * не нужна, а в /stats они не попадают, потому что не подписаны.
 */
import { onCLS, onINP, onLCP, onFCP, onTTFB } from './vendor/web-vitals/web-vitals.attribution.js';

const KEY = 'hub_web_vitals';
const SESSION_MAX = 50;

/** Метрики, которые действительно влияют на ощущение скорости в этом хабе. */
const SUBSCRIBERS = { onCLS, onINP, onLCP, onFCP, onTTFB };

let installed = false;

/** Порог, при котором метрика считается проблемной. */
function isBad(metric) {
  // INP: 200мс — «хорошо», 500мс — «плохо» по web.dev. Остальные судим по
  // той же логике, но с порогами, приемлемыми для iframe-холдинга в мессенджере.
  const bad = { INP: 500, LCP: 2500, CLS: 0.25, FCP: 3000, TTFB: 800 };
  const limit = bad[metric.name];
  if (limit == null) return false;
  return metric.name === 'CLS' ? metric.value > limit : metric.value > limit;
}

function record(metric) {
  const entry = {
    ts: Date.now(),
    kind: 'web_vital',
    name: metric.name,
    value: Math.round(metric.value),
    rating: metric.rating || (isBad(metric) ? 'poor' : 'good'),
    // Идентификатор источника помогает понять, что именно тормозит:
    // загрузка модуля, отрисовка меню или игра в iframe.
    source: metric.attribution?.element?.tagName?.toLowerCase() || metric.entryType || '',
    view: location.pathname,
  };
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '[]');
    all.push(entry);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-SESSION_MAX)));
  } catch { /* private mode */ }

  // Только плохие значения уходят в аналитику: хорошие не требуют внимания,
  // а каждый вызов стоит одного события в rate-limited /ev.
  if (entry.rating === 'poor' && window.HUB_TRACK_ENDPOINT) {
    try {
      const body = JSON.stringify({
        action: 'client_error', game: null, value: entry.value, ts: entry.ts,
        meta: { kind: 'web_vital', name: entry.name, rating: entry.rating, source: entry.source },
      });
      navigator.sendBeacon?.(window.HUB_TRACK_ENDPOINT, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
    } catch { /* потеря метрики не должна ломать страницу */ }
  }
  return entry;
}

/**
 * Установка наблюдателей. Идемпотентна: оболочка вызывает её на каждом
 * открытии Mini App, а подписка должна быть одна на сессию.
 */
export function installWebVitals() {
  if (installed) return false;
  installed = true;
  for (const [, subscribe] of Object.entries(SUBSCRIBERS)) {
    try { subscribe(record, { reportAllChanges: false }); } catch { /* браузер без поддержки */ }
  }
  return true;
}

export function webVitals() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

/**
 * Итог по текущей сессии: худшее значение по каждой метрике.
 * Именно эта форма нужна для чтения человеком, а не поток отдельных записей.
 */
export function webVitalsSummary() {
  const rows = webVitals();
  const worst = {};
  for (const r of rows) {
    if (worst[r.name] === undefined || r.value > worst[r.name].value) worst[r.name] = r;
  }
  return {
    samples: rows.length,
    worst,
    poor: rows.filter((r) => r.rating === 'poor').map((r) => r.name),
  };
}
