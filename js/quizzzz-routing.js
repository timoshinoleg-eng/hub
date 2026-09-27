/**
 * Маршрутизация legacy-намерений Quizzzz — чистая логика без побочных эффектов.
 *
 * Отдельный модуль потому, что launch-router.js теперь грузит bridge.js
 * версионным динамическим импортом, а такой импорт не разбирается ни Vite, ни
 * тестовым раннером. Кроме того, разделение совпадает с остальным проектом:
 * решения о поведении живут в чистых модулях (ui-state, duel, daily),
 * а связывание с браузером — в оболочке.
 *
 * Импортируется напрямую и из Node, и из браузера.
 */
const QUIZZZZ_EXACT = new Set(['daily', 'league', 'leaderboard', 'challenge_new']);

// Разрешённый набор символов: намерение приходит из start_param, который
// формирует оператор, но проверить его всё равно обязательно — строка
// подставляется в query и в длинные ссылки.
const SAFE_START = /^[A-Za-z0-9_-]{1,512}$/;

/**
 * Является ли намерение маршрутом в Quizzzz.
 *
 * Аркадные ссылки вида g<game>[_s<score>] намеренно не подходят: хаб не должен
 * перехватывать собственные deep links, иначе «поделиться результатом»
 * зацикливается сам на себя.
 */
export function isQuizzzzStartParam(value) {
  const param = String(value || '').trim();
  if (!SAFE_START.test(param)) return false;
  return QUIZZZZ_EXACT.has(param) || param.startsWith('d_') || param.startsWith('challenge_');
}

/** Целевой URL Quizzzz с сохранением намерения. Пустая строка — не наше намерение. */
export function quizzzzLaunchUrl(value, origin) {
  const param = String(value || '').trim();
  if (!isQuizzzzStartParam(param)) return '';
  const target = new URL('/quiz/', origin);
  target.searchParams.set('from', 'hub');
  target.searchParams.set('startapp', param);
  return target.toString();
}
