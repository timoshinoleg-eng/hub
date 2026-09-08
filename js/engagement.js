import { dailySeed } from './daily.js';

const KEY = 'hub_visit_v1';

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : null;
}

/**
 * Возвращает только агрегируемый факт визита. В storage хранится календарная
 * дата последнего запуска, без user id, random id, initData или fingerprint.
 */
export function observeVisit(today = dailySeed()) {
  const current = dayNumber(today);
  if (current == null) return { firstVisit: false, returning: false, daysAway: null };

  const s = storage();
  if (!s) return { firstVisit: false, returning: false, daysAway: null };

  let lastDate = null;
  try {
    const raw = JSON.parse(s.getItem(KEY) || 'null');
    if (raw && typeof raw.lastDate === 'string') lastDate = raw.lastDate;
  } catch { /* ignore corrupt local state */ }

  const previous = dayNumber(lastDate);
  const firstVisit = previous == null;
  const gap = previous == null ? null : current - previous;
  const returning = Number.isFinite(gap) && gap > 0;
  const daysAway = returning ? Math.min(365, Math.floor(gap)) : null;

  try { s.setItem(KEY, JSON.stringify({ lastDate: today })); } catch { /* private mode */ }
  return { firstVisit, returning, daysAway };
}
