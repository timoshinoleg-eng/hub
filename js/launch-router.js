// Импорт намеренно версионный, как и весь остальной исполняемый граф оболочки.
// Это единственный статический импорт в лаунчере, и без query он кешировался
// между запусками: после релиза MAX WebView мог подсунуть старый bridge.js
// вместе с новым main.js. Именно этот класс багов породил семь из
// семнадцати коммитов репозитория.
//
// Ревизия читается через globalThis, а не через window: модуль импортируется
// и из Node в tools/quizzzz-integration.mjs, где window не существует.
const REVISION = encodeURIComponent(globalThis.window?.HUB_ASSET_REVISION || '');
const { bridge } = await import(`./bridge.js?v=${REVISION}`);

const QUIZZZZ_EXACT = new Set(['daily', 'league', 'leaderboard', 'challenge_new']);
const SAFE_START = /^[A-Za-z0-9_-]{1,512}$/;

export function isQuizzzzStartParam(value) {
  const param = String(value || '').trim();
  if (!SAFE_START.test(param)) return false;
  return QUIZZZZ_EXACT.has(param) || param.startsWith('d_') || param.startsWith('challenge_');
}

export function quizzzzLaunchUrl(value, origin) {
  const param = String(value || '').trim();
  if (!isQuizzzzStartParam(param)) return '';
  const target = new URL('/quiz/', origin);
  target.searchParams.set('from', 'hub');
  target.searchParams.set('startapp', param);
  return target.toString();
}

export function routeQuizzzzLaunch() {
  if (typeof window === 'undefined') return false;
  const target = quizzzzLaunchUrl(bridge.startParam(), window.location.origin);
  if (!target) return false;
  window.location.replace(target);
  return true;
}
