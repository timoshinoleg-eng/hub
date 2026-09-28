// Лаунчер только связывает маршрутизацию с MAX Bridge.
//
// Маршрутизация вынесена в js/quizzzz-routing.js: bridge.js грузится
// версионным динамическим импортом, который не разбирается ни Vite, ни тестовым
// раннером. Это разделение совпадает с остальным проектом: решения о поведении
// живут в чистых модулях (ui-state, duel, daily), связывание — в оболочке.
//
// Оба импорта намеренно версионные. Любой статический импорт исполняемого
// модуля кешируется между запусками MAX WebView, и после релиза лаунчер мог бы
// получить старую логику маршрутизации вместе с новым main.js. Именно этот
// класс багов породил семь из семнадцати коммитов репозитория.
//
// Ревизия читается через globalThis, а не через window: модуль импортируется
// и из Node в tools/quizzzz-integration.mjs, где window не существует.
const REVISION = encodeURIComponent(globalThis.window?.HUB_ASSET_REVISION || 'dev');
const { isQuizzzzStartParam, quizzzzLaunchUrl } = await import(`./quizzzz-routing.js?v=${REVISION}`);
const { bridge } = await import(`./bridge.js?v=${REVISION}`);

export { isQuizzzzStartParam, quizzzzLaunchUrl };

/**
 * Перенаправляет запуск, если start_param указывает в Quizzzz.
 * Возвращает true, если редирект выполнен, чтобы вызывающий не грузил main.js.
 */
export function routeQuizzzzLaunch() {
  if (typeof window === 'undefined') return false;
  const target = quizzzzLaunchUrl(bridge.startParam(), window.location.origin);
  if (!target) return false;
  window.location.replace(target);
  return true;
}
