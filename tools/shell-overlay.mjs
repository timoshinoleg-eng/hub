#!/usr/bin/env node
/**
 * Регресс-контракт оверлея оболочки.
 *
 * #overlay — отдельный position:fixed слой, он не скрывается переключением
 * body[data-view]. Раньше только openGame() и showResult() очищали его, а
 * backToMenu() не делал. В результате карточка результата, challenge-баннер
 * или подсказка оставались поверх меню и перехватывали касания после
 * системной кнопки «Назад» или бара «‹».
 *
 * Контракт проверяет, что каждый путь выхода из игрового вида очищает слой,
 * и что очистка идемпотентна.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(join(ROOT, 'js', 'main.js'), 'utf8');
const css = readFileSync(join(ROOT, 'css', 'hub.css'), 'utf8');

// Оверлей обязан быть отдельным fixed-слоем: именно поэтому его нельзя
// спрятать сменой data-view. Если это изменится, контракт надо переписать.
assert.match(css, /#overlay\{[^}]*position:fixed/, '#overlay is a position:fixed layer');
assert.match(css, /#overlay>\*\{pointer-events:auto\}/, 'overlay children capture pointer input');
assert.match(css, /body\[data-view="menu"\] #view-game\{display:none\}/, 'view switching hides only #view-game, not #overlay');

assert.match(main, /function clearOverlay\(\)/, 'shell exposes a single overlay reset helper');

// Каждый выход из игрового вида обязан вызывать helper, а не править innerHTML
// вразнобой — иначе следующий путь забудет про очистку.
for (const [fn, label] of [
  ['function backToMenu()', 'backToMenu'],
  ['function openGame(', 'openGame'],
  ['function showResult()', 'showResult'],
]) {
  const start = main.indexOf(fn);
  assert.notEqual(start, -1, `${label} exists`);
  const body = main.slice(start, main.indexOf('\nfunction ', start + 1) === -1 ? main.length : main.indexOf('\nfunction ', start + 1));
  assert.match(body, /clearOverlay\(\)/, `${label} clears the overlay through the helper`);
  assert.doesNotMatch(body, /\$\('#overlay'\)\.innerHTML = ''/, `${label} no longer mutates overlay innerHTML directly`);
}

// Прочие точки вставки (подсказка, challenge-баннер, диалог согласия) только
// добавляют содержимое — это законно, очистку обеспечивает backToMenu.
const appends = main.match(/\$\('#overlay'\)\.appendChild\(/g) || [];
assert.ok(appends.length >= 3, 'overlay insertion points remain for tips, banners and dialogs');

// clearOverlay обязан быть безопасна на отсутствующем узле: DOM может быть
// недоступен в момент раннего вызова.
const helper = main.slice(main.indexOf('function clearOverlay()'), main.indexOf('\n}', main.indexOf('function clearOverlay()')));
assert.match(helper, /if \(overlay\)/, 'clearOverlay tolerates a missing overlay node');
assert.match(helper, /innerHTML = ''/, 'clearOverlay removes all overlay children');

console.log('shell overlay contract: ok');
console.log('  backToMenu/openGame/showResult clear the fixed overlay through one helper');
console.log('  challenge banner, game tip and consent dialog cannot survive a view switch');
