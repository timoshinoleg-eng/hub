#!/usr/bin/env node
/**
 * Контракт доступности оболочки.
 *
 * Проверяет то, что невозможно увидеть на скриншоте в MAX WebView: снят ли
 * запрет масштабирования, виден ли фокус, достижимы ли области касания,
 * есть ли у диалогов семантика.
 *
 * Часть проверок статическая (CSS и разметка), часть исполняет код в vm с
 * минимальным DOM-стендом, чтобы убедиться, что a11y-атрибуты действительно
 * проставляются, а не только описаны комментарием.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const main = read('js/main.js');
const css = read('css/hub.css') + read('css/polish.css');
const index = read('index.html');

// ── Масштабирование ────────────────────────────────────────────────────────
// user-scalable=no блокирует pinch-zoom, то есть нарушает WCAG 1.4.4. В WebView
// мессенджера это не даёт ничего, кроме недоступности.
const viewports = [join(ROOT, 'index.html')];
for (const d of readdirSync(join(ROOT, 'games'))) {
  const p = join(ROOT, 'games', d, 'index.html');
  try { if (statSync(p).isFile()) viewports.push(p); } catch { /* не каталог */ }
}
for (const p of viewports) {
  const html = readFileSync(p, 'utf8');
  const tag = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i)?.[0] || '';
  assert.ok(tag, `${p}: есть viewport meta`);
  assert.doesNotMatch(tag, /user-scalable\s*=\s*no/i, `${p}: масштабирование не запрещено (WCAG 1.4.4)`);
  assert.doesNotMatch(tag, /maximum-scale\s*=\s*1\s*[,"']/i, `${p}: нет жёсткого maximum-scale`);
}

// viewport-fit=cover нужен для safe-area на iOS с вырезом; в оболочке он был.
assert.match(index, /viewport-fit=cover/, 'оболочка объявляет viewport-fit=cover для safe-area');

// ── Видимый фокус ──────────────────────────────────────────────────────────
assert.match(css, /:focus-visible/, 'объявлен стиль видимого фокуса');
assert.match(css, /outline:\s*2px solid/, 'фокус обведён заметной линией, а не только сменой цвета');
assert.match(css, /outline-offset/, 'фокус отделён от элемента, иначе его не разглядеть на тёмном фоне');

// ── Размер цели касания ────────────────────────────────────────────────────
assert.match(css, /\.icon-btn[^{]*\{[^}]*min-width:\s*44px/, 'кнопки бара не меньше 44px (WCAG 2.5.5)');
assert.match(css, /\.result-link[^{]*\{[^}]*min-height:\s*44px/, 'текстовые действия не меньше 44px');

// ── Семантика диалога ──────────────────────────────────────────────────────
assert.match(main, /setAttribute\('role', 'dialog'\)/, 'оверлей объявляется диалогом');
assert.match(main, /setAttribute\('aria-modal', 'true'\)/, 'диалог помечен модальным');
assert.match(main, /e\.key === 'Escape'/, 'диалог закрывается по Escape');
assert.match(main, /lastOverlayFocus/, 'фокус возвращается на элемент, открывший диалог');
assert.ok(!/aria-hidden="true"\s*>\s*<div id="view-game"/.test(index), 'скрываемый игровой вид не спрятан от скринридера без aria-флага');

// Игровые карточки — настоящие кнопки, а не div с обработчиком: иначе их
// нельзя выбрать с клавиатуры.
assert.match(main, /el\('button', 'gcard'/, 'карточки игр — элементы button');
assert.match(index, /<button id="back"/, 'кнопка «назад» семантическая');
assert.match(index, /<button id="reload"/, 'кнопка «заново» семантическая');

// Единственная ссылка в документе, доступная без JS, — политика.
assert.match(index, /class="mfoot" id="legal"/, 'правовые ссылки рендерятся в предсказуемый контейнер');
assert.match(index, /<h1>Игротека<\/h1>/, 'есть единственный заголовок первого уровня');

// ── Реальная установка модальности ─────────────────────────────────────────
// Комментарий ничего не доказывает: проверяем, что markModal реально ставит
// атрибуты и вешает обработчик Escape.
const attrs = {};
const listeners = {};
let focusCalls = 0;
const overlayNode = {
  setAttribute: (k, v) => { attrs[k] = v; },
  removeAttribute: (k) => { delete attrs[k]; },
  getAttribute: (k) => attrs[k] ?? null,
  querySelector: () => ({ focus: () => { focusCalls++; } }),
  firstElementChild: {},
};
const bodyNode = { dataset: {}, attributes: {}, removeAttribute: (k) => { delete bodyNode.attributes[k]; } };
const sandbox = {
  document: {
    activeElement: { tagName: 'BUTTON' },
    body: bodyNode,
    contains: () => true,
    querySelector: (sel) => (sel === '#overlay' ? overlayNode : null),
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: (t) => { delete listeners[t]; },
  },
  addEventListener: () => {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
// Вырезаем весь блок оверлея целиком: markModal, onOverlayKeydown и
// clearOverlay вызывают друг друга, поэтому изолировать одну функцию нельзя —
// получится ReferenceError вместо проверки поведения.
const overlayBlock = main.slice(
  main.indexOf("const FOCUSABLE = '"),
  main.indexOf('function esc(s)'),
);
vm.runInContext('var $ = (s) => document.querySelector(s);' + overlayBlock.replace(/export /g, ''), sandbox, { filename: 'shell-overlay' });
sandbox.markModal();
assert.equal(attrs.role, 'dialog', 'markModal реально проставляет role=dialog');
assert.equal(attrs['aria-modal'], 'true', 'markModal реально проставляет aria-modal');
assert.ok(typeof attrs['aria-label'] === 'string' && attrs['aria-label'].length > 0, 'диалог имеет доступное имя');
assert.equal(bodyNode.dataset.modal, 'true', 'body помечен модальным состоянием');assert.ok(typeof listeners.keydown === 'function', 'обработчик клавиатуры установлен');
assert.ok(focusCalls > 0, 'фокус перемещается внутрь диалога, а не остаётся на body');

// Escape действительно снимает модальность и чистит оверлей.
overlayNode.innerHTML = 'placeholder';
sandbox.onOverlayKeydown({ key: 'Escape', preventDefault: () => {} });
assert.equal(overlayNode.innerHTML, '', 'Escape очищает содержимое оверлея');
assert.equal(attrs.role, undefined, 'Escape снимает роль диалога');
assert.equal(bodyNode.dataset.modal, undefined, 'Escape снимает модальное состояние body');
assert.ok(!listeners.keydown, 'обработчик клавиатуры снят вместе с оверлеем');

console.log('accessibility contract: ok');
console.log(`  масштабирование разрешено в ${viewports.length} документов (WCAG 1.4.4)`);
console.log('  видимый фокус, цели касания 44px, диалоги с ролью/Escape/ловушкой фокуса');
