#!/usr/bin/env node
/**
 * Контракт оффлайна.
 *
 * Оффлайн опасен не тем, что не работает, а тем, что работает неправильно и
 * тихо: сервис-воркер, отдающий из кеша шелл, не падает — он возвращает прошлую
 * сборку, и после релиза пользователь этого не видит. Ровно эта поломка стоила
 * в репозитории семи коммитов (tools/cache-recovery.mjs), поэтому здесь
 * закреплены свойства, при которых оффлайн с ней не столкнётся.
 *
 * Проверяются текст исходников и конфигурации, а не поведение в браузере:
 * браузерная проверка живёт в tests/e2e, а этот контракт должен ловить
 * поломку на CI за секунды, до запуска сборки.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHELL_MODULES, isBypassed, isRuntimeConfig, swCacheName, swPrecacheList } from '../js/offline.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const has = (p) => existsSync(join(ROOT, p));

// ── Файлы существуют ────────────────────────────────────────────────────────
for (const file of ['sw.js', 'manifest.webmanifest', 'js/offline.js', 'assets/icon.svg', 'assets/icon-maskable.svg']) {
  assert.ok(has(file), `${file}: отсутствует — оффлайн не собран`);
}

// ── Манифест ────────────────────────────────────────────────────────────────
const manifest = JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.lang, 'ru', 'манифест объявляет русский язык');
assert.equal(manifest.theme_color, '#090b14', 'theme_color совпадает с --bg в css/hub.css');
assert.equal(manifest.background_color, '#090b14', 'background_color совпадает с --bg в css/hub.css');
assert.ok(manifest.start_url && manifest.scope, 'у манифеста есть start_url и scope');
// Относительные адреса: в production Caddy отдаёт хаб под /hub/ и срезает
// префикс, поэтому зашитый /hub/ сломал бы и dev, и любой другой префикс.
assert.ok(!manifest.start_url.startsWith('/'), 'start_url относительный, а не прибит к /hub/');
assert.ok(!String(manifest.id || '').startsWith('/'), 'id относительный, а не прибит к /hub/');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'есть обычная и maskable-иконка');
for (const icon of manifest.icons) {
  assert.ok(has(icon.src), `иконка ${icon.src} не найдена`);
  assert.equal(icon.type, 'image/svg+xml', `иконка ${icon.src}: растровых ассетов в проекте нет, ожидался SVG`);
}
// Маску накладывает система, поэтому maskable-иконка обязана быть отдельным
// файлом без скруглений: переиспользование обычной даёт прозрачные углы.
assert.notEqual(manifest.icons[0].src, manifest.icons[1].src, 'any и maskable — разные файлы');
assert.ok(!/rx\s*=/.test(read('assets/icon-maskable.svg')), 'maskable-иконка без rx: маску накладывает система');
assert.ok(/rx\s*=/.test(read('assets/icon.svg')), 'обычная иконка скруглена');

// ── index.html ──────────────────────────────────────────────────────────────
const index = read('index.html');
assert.ok(index.includes('<link rel="manifest" href="manifest.webmanifest">'), 'index.html подключает манифест');
assert.ok(index.includes('<link rel="icon"'), 'index.html объявляет фавикону');
// Форму загрузки шелла пиннит cache-recovery; добавление строк выше не должно
// её сломать.
assert.ok(/window\.__HUB_DYNAMIC_BOOT__\s*=\s*true/.test(index), 'динамическая загрузка шелла на месте');

// ── Регистрация ─────────────────────────────────────────────────────────────
const main = read('js/main.js');
assert.ok(main.includes('import(`./offline.js?v=${v}`)'), 'main.js тянет общую логику оффлайна, а не копию');
assert.ok(main.includes('swRegisterUrl('), 'регистрация идёт через вычисленный адрес');
assert.ok(main.includes("type: 'module'"), 'воркер модульный: список прекэша не дублируется в sw.js');
assert.ok(main.includes('isSecureContext'), 'регистрация пропускается вне безопасного контекса');
assert.ok(/\.catch\(\(\) => \{\}\)/.test(main), 'ошибка регистрации не превращается в ошибку в консоли');

// ── sw.js ───────────────────────────────────────────────────────────────────
const sw = read('sw.js');
assert.ok(/^import \{[^}]*\} from '\.\/js\/offline\.js';/m.test(sw),
  'sw.js импортирует ту же логику прекэша, а не несёт свой список');
// Статический импорт, а не top-level await: воркер с await на верхнем уровне не
// стартует вовсе, и оффлайн пропадает молча, без единой ошибки в консоли.
assert.ok(!/^\s*const\s*\{[^}]*\}\s*=\s*await import/m.test(sw), 'в sw.js нет top-level await');
assert.ok(sw.includes('isRuntimeConfig(request.url)'), 'конфигурация сборки обрабатывается отдельной веткой');
assert.ok(!/__hubRand|DAILY_SEED/.test(sw), 'в воркере нет остатков старой инъекции');
// Ключевое свойство: переход — network-first. Обратный порядок означал бы, что
// после релиза пользователь до бесконечности открывает прошлую сборку.
assert.ok(sw.includes("request.mode === 'navigate'"), 'переходы обрабатываются отдельно');
const navigation = sw.slice(sw.indexOf('async function handleNavigation'), sw.indexOf('async function cacheFirst'));
assert.ok(navigation.includes('await fetch(request)'), 'переход сначала идёт в сеть');
assert.ok(navigation.indexOf('await fetch(request)') < navigation.indexOf('cache.match'),
  'сеть пробуется раньше кеша');
assert.ok(sw.includes('isBypassed(request.url)) return'), 'обход проверяется до перехвата');

// Проверка настоящего списка, а не регулярки по тексту: регулярка смотрела бы
// на модуль, который сам и является предметом проверки.
const precache = swPrecacheList('20260916-games12');
assert.ok(precache.includes('runtime-config.js'),
  'runtime-config.js в кеше: без него оффлайн не включается, модули не знают ревизии');
assert.ok(precache.includes('index.html'), 'index.html прекэшится: иначе оффлайн-вход не откроется');
assert.ok(!isBypassed('/hub/runtime-config.js'), 'runtime-config.js не обходится, а обрабатывается отдельно');
assert.ok(isRuntimeConfig('/hub/runtime-config.js'), 'runtime-config.js распознаётся отдельной веткой');
assert.ok(!isRuntimeConfig('/hub/js/main.js'), 'main.js не путается с конфигом');
assert.ok(isBypassed('/hub-api/ev'), 'аналитика в списке обхода');
assert.ok(swCacheName('rev-1').startsWith('hub-'), 'кеш называется hub-*, чтобы activate вычищал чужие');
// claim() обязателен: верхнеуровневая навигация перехватывается только когда
// воркер уже управляет страницей, и без него первая перезагрузка без сети
// падала бы. skipWaiting, наоборот, не нужен и опасен.
assert.ok(sw.includes('self.clients.claim()'), 'воркер забирает текущую страницу, иначе оффлайн не заработает');
assert.ok(!/^\s*await self\.skipWaiting\(\)/m.test(sw), 'skipWaiting не используется: он активировал бы новую сборку поверх старой сессии');

// Навигацию видят и iframe'ы игр, поэтому ответ кладётся по адресу запроса.
// Общий ключ `index.html` означал бы, что открытая игра затирает шелл в кеше и
// следующая загрузка меню отдаёт документ игры. Ошибка молчаливая и проявляется
// только на полном прогоне.
assert.ok(!navigation.includes("cache.put('index.html'"),
  'навигация не пишет в общий ключ index.html: иначе игра затрёт шелл');
assert.ok(navigation.includes('cache.put(request'),
  'навигация кладёт ответ по адресу запроса');

// Каждый модуль, который шелл грузит с ?v=, обязан быть в прекэше. Обратное
// означало бы падение всей загрузки оффлайн: версионированный адрес идёт через
// cache-first, у которого нет ни кеша, ни сети, и импорт падает вместо того,
// чтобы отдать картинку. Список импортов читается из исходников, а не
// дублируется, поэтому новый импорт в main.js нельзя забыть молча.
const graph = ['js/main.js', 'js/bootstrap.js', 'js/launch-router.js'];
const imported = new Set();
for (const file of graph) {
  for (const m of read(file).matchAll(/import\(`\.\/([\w-]+)\.js\?v=/g)) imported.add(m[1]);
}
assert.ok(imported.size >= 14, `граф импортов разобран: найдено ${imported.size} модулей`);
for (const name of imported) {
  assert.ok(SHELL_MODULES.includes(name),
    `${name} импортируется с ?v=, но не в списке прекэша: оффлайн упадёт целиком`);
}
// Внутримодульные статические импорты ?v= не несут, поэтому отдельного адреса в
// кеше для них нет: их спасает откат на версионированный адрес в sw.js.
assert.ok(sw.includes('versionedFallback('), 'в sw.js есть откат на версионированный адрес');
assert.ok(sw.indexOf('versionedFallback(') > sw.indexOf('async function staleWhileRevalidate'),
  'откат применяется в staleWhileRevalidate — там, где иначе возвращается 504');

// ── nginx ───────────────────────────────────────────────────────────────────
const nginx = read('deploy/nginx.conf');
// Регистрация упала бы по MIME, а не по существу, если бы отсутствующий sw.js
// приходил как index.html: у SPA-фолбэка именно такое поведение.
//
// Блок вырезается целиком, а не ищется регуляркой «открывающая скобка и дальше
// любой текст»: ленивое [\s\S]*? перескакивало на следующее правило и находило
// `try_files =404` уже в нём — проверка проходила бы при удалённом правиле.
const swBlock = nginx.match(/^\s*location = \/sw\.js \{([\s\S]*?)^\s*\}/m)?.[1] || '';
assert.ok(swBlock, 'у sw.js есть точное правило в deploy/nginx.conf');
assert.ok(swBlock.includes('try_files $uri =404;'),
  'sw.js отдаётся как sw.js: try_files =404, а не SPA-фолбэк');
assert.ok(swBlock.includes('Cache-Control "no-store"'),
  'sw.js отдаётся no-store: иначе браузер не сравнит скрипт и не подхватит новый релиз');
assert.ok(nginx.includes('location = /manifest.webmanifest'), 'у манифеста есть точное правило');
assert.ok(nginx.includes('application/manifest+json'), 'манифест отдаётся с application/manifest+json');
// Политика шелла, выигранная в tools/cache-recovery.mjs, не ослабляется ради
// оффлайна: именно она чинит залипание MAX на старой сборке.
assert.ok(nginx.includes('Cache-Control "no-cache, must-revalidate"'),
  'шелл и модули по-прежнему ревалидируются');
// Подстрока, а не регулярка: в конфиге стоит литеральный обратный слэш перед
// точкой, и в регулярке это легко перепутать с экранированием точки.
assert.ok(nginx.includes('location ~* \\.(?:html|js)$'), 'правило ревалидации html/js на месте');
assert.ok(nginx.includes('location = /runtime-config.js') && nginx.includes('no-store'),
  'runtime-config.js остаётся no-store');

// ── Тестовый сервер повторяет production ────────────────────────────────────
const serve = read('tests/serve.mjs');
assert.ok(/\.webmanifest':\s*'application\/manifest\+json/.test(serve), 'tests/serve.mjs знает MIME манифеста');
assert.ok(serve.includes("'sw.js'"), 'tests/serve.mjs повторяет no-store для sw.js');
assert.ok(serve.includes("'runtime-config.js'"), 'tests/serve.mjs повторяет no-store для runtime-config.js');

console.log('offline / PWA contract: ok');
console.log('  service worker, манифест и иконки на месте');
console.log('  переход — network-first, версионированные адреса — cache-first');
console.log('  runtime-config.js и аналитика не перехватываются');
console.log('  политика кеша шелла не ослаблена');
