#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeConfig = readFileSync(join(root, 'runtime-config.js'), 'utf8');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const main = readFileSync(join(root, 'js', 'main.js'), 'utf8');

function executeRuntimeConfig(dynamicBoot) {
  const appended = [];
  const sandbox = {
    encodeURIComponent,
    document: {
      createElement: (tag) => ({ tag }),
      head: { appendChild: (node) => appended.push(node) },
    },
    window: dynamicBoot ? { __HUB_DYNAMIC_BOOT__: true } : {},
  };
  vm.createContext(sandbox);
  vm.runInContext(runtimeConfig, sandbox, { filename: 'runtime-config.js' });
  return { appended, window: sandbox.window };
}

const legacyShell = executeRuntimeConfig(false);
assert.equal(legacyShell.appended.length, 1, 'uncached runtime config upgrades a legacy cached shell');
assert.equal(legacyShell.appended[0].type, 'module', 'legacy recovery loads the Hub as an ES module');
assert.match(legacyShell.appended[0].src, /^js\/bootstrap\.js\?v=.+/, 'legacy recovery uses a versioned main module URL');
assert.ok(legacyShell.window.HUB_ASSET_REVISION, 'runtime config exposes the active asset revision');

const currentShell = executeRuntimeConfig(true);
assert.equal(currentShell.appended.length, 0, 'current shell owns a single module boot');
assert.match(index, /window\.__HUB_DYNAMIC_BOOT__\s*=\s*true/, 'current shell identifies its versioned boot path');
assert.match(index, /js\/bootstrap\.js\?v=/, 'current shell loads a versioned bootstrap module URL');
assert.doesNotMatch(index, /<script type="module" src="js\/main\.js"><\/script>/, 'unversioned static main boot is removed');
for (const dep of ['bridge', 'track', 'share', 'duel', 'daily', 'engagement', 'progress', 'ui-state', 'games']) {
  const expected = `await import(\`./${dep}.js?v=\${v}\`)`;
  assert.ok(main.includes(expected), `recovery main module requests versioned ${dep}.js`);
}
assert.doesNotMatch(main, /from ['"]\.\/(track|share|duel|daily|engagement|progress|ui-state|games)\.js['"]/, 'nested Hub modules are never imported with stale unversioned URLs');
assert.match(main, /document\.readyState === 'loading'/, 'recovery main module initializes after a late dynamic load');

// launch-router.js — единственный модуль, импортируемый до main.js, и раньше
// единственный со статическим импортом bridge.js. Именно такой остаточный
// неверсионированный импорт кешировался между запусками MAX WebView.
const router = readFileSync(join(root, 'js', 'launch-router.js'), 'utf8');
assert.doesNotMatch(router, /^import\s/m, 'launch-router has no unversioned static imports');
assert.match(router, /import\(`\.\/bridge\.js\?v=\$\{REVISION\}`\)/, 'launch-router loads bridge.js with the release revision');
assert.match(router, /globalThis\.window\?\.HUB_ASSET_REVISION/, 'launch-router reads the revision defensively, so Node-side imports still work');
// Ревизия обязана приходить из runtime-config, а не быть зашитой в модуль.
assert.match(router, /HUB_ASSET_REVISION/, 'launch-router derives the revision from runtime config');

// Фолбэк-ревизии обязаны совпадать между собой.
//
// runtime-config.js отдаётся no-store, поэтому при пропаже связи он не
// загрузится вообще, и каждый модуль возьмёт свой фолбэк. Раньше они
// расходились: index.html и bootstrap.js брали одну дату, main.js другую.
// В итоге граф грузился под двумя ревизиями одновременно — ровно та смесь
// старого и нового, ради которой написан весь этот контракт. Значение 'dev'
// выбрано вместо даты специально: оно не выглядит как релиз, поэтому его
// нельзя случайно выдать за боевую сборку, и правка ревизии больше не
// требует править четыре файла.
const fallbacks = new Map();
for (const [file, src] of [
  ['index.html', readFileSync(join(root, 'index.html'), 'utf8')],
  ['js/bootstrap.js', readFileSync(join(root, 'js', 'bootstrap.js'), 'utf8')],
  ['js/launch-router.js', router],
  ['js/main.js', main],
]) {
  const m = src.match(/HUB_ASSET_REVISION\s*\|\|\s*'([^']+)'/);
  assert.ok(m, `${file}: фолбэк-ревизия должна быть строковым литералом, а не undefined`);
  fallbacks.set(file, m[1]);
}
const distinct = new Set(fallbacks.values());
assert.equal(distinct.size, 1, `фолбэк-ревизии в модулях шелла разошлись: ${[...fallbacks].map(([f, v]) => `${f}=${v}`).join(', ')}`);

// Ревизия из runtime-config обязана отличаться от фолбэка: иначе оффлайн-сбой
// и обычный запуск выглядели бы одинаково, и по логам нельзя было бы понять,
// что конфиг не пришёл.
const shipped = runtimeConfig.match(/HUB_ASSET_REVISION\s*=\s*'([^']+)'/)?.[1];
assert.ok(shipped, 'runtime-config.js объявляет HUB_ASSET_REVISION');
assert.notEqual(shipped, [...distinct][0], 'боевая ревизия runtime-config не должна совпадать с фолбэком');

console.log('MAX cached-shell recovery contract: ok');
console.log('  every executable module in the shell graph is loaded with a release-scoped URL');
console.log('  including launch-router.js, which is evaluated before main.js');
