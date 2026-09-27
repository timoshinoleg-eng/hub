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

// Сигнатура изменилась: clearOverlay теперь принимает параметры (см. a11y-PR),
// поэтому ищем по имени функции, а не по точному тексту объявления.
assert.match(main, /function clearOverlay\s*\(/, 'shell exposes a single overlay reset helper');

// Вырезает тело функции по имени, а не по точному тексту объявления: сигнатуры
// меняются (clearOverlay получила параметры), и жёсткая привязка к строке
// ломала контракт на ровном месте.
function functionBody(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function ${name}\\s*\\(`));
  if (start === -1) return null;
  // Сначала пропускаем сигнатуру: у неё могут быть собственные скобки
  // ({ restoreFocus = true } = {}), и они не являются телом функции.
  let parens = 0;
  let i = source.indexOf('(', start);
  for (; i < source.length; i++) {
    if (source[i] === '(') parens++;
    else if (source[i] === ')') { parens--; if (parens === 0) break; }
  }
  let depth = 0;
  let opened = false;
  for (i++; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') { depth++; opened = true; }
    else if (ch === '}') {
      depth--;
      if (opened && depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

// Каждый выход из игрового вида обязан вызывать helper, а не править innerHTML
// вразнобой — иначе следующий путь забудет про очистку.
for (const [name, label] of [
  ['backToMenu', 'backToMenu'],
  ['openGame', 'openGame'],
  ['showResult', 'showResult'],
]) {
  const body = functionBody(main, name);
  assert.ok(body, `${label} exists`);
  assert.match(body, /clearOverlay\(/, `${label} clears the overlay through the helper`);
  assert.doesNotMatch(body, /\$\('#overlay'\)\.innerHTML = ''/, `${label} no longer mutates overlay innerHTML directly`);
}

// Прочие точки вставки (подсказка, challenge-баннер, диалог согласия) только
// добавляют содержимое — это законно, очистку обеспечивает backToMenu.
const appends = main.match(/\$\('#overlay'\)\.appendChild\(/g) || [];
assert.ok(appends.length >= 3, 'overlay insertion points remain for tips, banners and dialogs');

// clearOverlay обязана быть безопасна на отсутствующем узле: DOM может быть
// недоступен в момент раннего вызова.
const helper = functionBody(main, 'clearOverlay');
assert.ok(helper, 'clearOverlay exists');
assert.match(helper, /if \(overlay\)/, 'clearOverlay tolerates a missing overlay node');
assert.match(helper, /innerHTML = ''/, 'clearOverlay removes all overlay children');

// ── Модальность и клавиатура ──────────────────────────────────────────────
//
// Карточка результата была просто div в position:fixed: без роли, без
// aria-modal, без закрытия по Escape и без ловушки фокуса. Для клавиатурного
// пользователя это означало, что Tab уходит в скрытое под меню содержимое, а
// закрыть результат с клавиатуры было нечем.
assert.match(main, /function markModal\(\)/, 'shell exposes a modal marker for overlay dialogs');
assert.match(main, /setAttribute\('role', 'dialog'\)/, 'overlay is announced as a dialog');
assert.match(main, /setAttribute\('aria-modal', 'true'\)/, 'overlay is marked modal');
assert.match(main, /e\.key === 'Escape'/, 'Escape closes the overlay');
assert.match(main, /FOCUSABLE/, 'focus trap enumerates focusable controls');
assert.match(helper, /lastOverlayFocus/, 'clearOverlay restores focus to the opener');
assert.match(helper, /MODAL_ATTRS/, 'clearOverlay removes exactly the attributes markModal sets');
// Проверяем код без комментариев: объясняющий комментарий внутри функции
// содержит сам запрещённый вызов и иначе давал бы ложное срабатывание.
const helperCode = helper.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
assert.doesNotMatch(helperCode, /removeAttribute\('aria-hidden'\)/, 'clearOverlay не снимает атрибут, которого markModal не ставит');
assert.doesNotMatch(helperCode, /removeAttribute\('data-modal'\)/, 'модальное состояние body снимается через dataset');

// Ни один обработчик не должен снимать слой в обход helper: иначе модальность
// и фокус останутся в неконсистентном состоянии.
const removeCalls = main.match(/\bbox\.remove\(\)|\bdone\.remove\(\)/g) || [];
assert.deepEqual(removeCalls, [], 'no handler removes overlay content directly instead of clearOverlay()');

// markModal обязан вызываться для всех трёх модальных сценариев.
const modalCalls = main.match(/markModal\(\);/g) || [];
assert.ok(modalCalls.length >= 3, 'result, consent and privacy dialogs are all marked modal', `вызовов: ${modalCalls.length}`);

// ── Отзыв согласия и отчётность об ошибках ─────────────────────────────────
assert.match(main, /openPrivacyPanel/, 'меню содержит точку управления данными и согласием');
assert.match(main, /revokeConsent\(\)/, 'отзыв согласия доступен из интерфейса');
assert.match(main, /installErrorReporting\(\)/, 'клиентские ошибки снимаются до инициализации');
assert.match(main, /showConfigBanner\(\)/, 'неполная конфигурация показывается пользователю, а не только в консоли');
// Порядок проверяем внутри init(), а не по всему файлу: renderMenu() впервые
// встречается в теле backToMenu(), которое объявлено раньше init.
const initBody = main.slice(main.indexOf('function init()'));
assert.ok(initBody.indexOf('installErrorReporting()') < initBody.indexOf('renderMenu()'),
  'обработчик ошибок ставится до первой отрисовки, иначе падение модуля останется невидимым');
assert.match(main, /subscriptionAvailable\(\)/, 'кнопка подписки проверяет и флаг, и наличие endpoint');

console.log('shell overlay contract: ok');
console.log('  backToMenu/openGame/showResult clear the fixed overlay through one helper');
console.log('  challenge banner, game tip and consent dialog cannot survive a view switch');
console.log('  dialogs are modal: role, aria-modal, Escape, focus trap, focus restore');
console.log('  consent revoke, client error reporting and config warnings are wired');

