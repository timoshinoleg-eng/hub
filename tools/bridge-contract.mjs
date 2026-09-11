#!/usr/bin/env node
/** Проверяет одноразовый handshake games/_boot.js ↔ parent и MAX share routing. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(join(ROOT, 'games', '_boot.js'), 'utf8');
const messages = [];
let messageHandler = null;
let intervals = 0;
const parent = { postMessage: (msg) => messages.push({ ...msg }) };
const currentScript = { getAttribute: (name) => name === 'data-game' ? 'merge' : null };
const sandbox = {
  parent, setInterval: () => { intervals++; return intervals; },
  document: { currentScript, querySelector: () => null, createElement: () => ({ textContent: '' }), head: { appendChild() {} }, body: { style: {} }, addEventListener() {} },
  window: { addEventListener(type, fn) { if (type === 'message') messageHandler = fn; } }, console,
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'games/_boot.js' });

let fails = 0;
function ok(cond, msg) { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; }
ok(typeof messageHandler === 'function', 'message handler зарегистрирован');
ok(messages.filter((m) => m.type === 'ready').length === 1, 'ready отправлен ровно один раз при загрузке');
messageHandler({ source: parent, data: { __hub: 1, type: 'cfg', game: 'merge', cfg: {} } });
ok(intervals === 1, 'первый cfg запускает ровно один polling interval');
ok(messages.filter((m) => m.type === 'ready').length === 1, 'start не отправляет повторный ready');
messageHandler({ source: parent, data: { __hub: 1, type: 'cfg', game: 'merge', cfg: {} } });
ok(intervals === 1, 'повторный cfg идемпотентен');
messageHandler({ source: {}, data: { __hub: 1, type: 'cfg', game: 'merge', cfg: {} } });
ok(intervals === 1, 'cfg от чужого window игнорируется');

let maxPayload = null;
let maxLink = null;
Object.defineProperty(globalThis, 'window', { configurable: true, value: { WebApp: { shareMaxContent(p) { maxPayload = p; } } } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { share: async () => {} } });
Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '' } });
const { bridge } = await import(`../js/bridge.js?contract=${Date.now()}`);
await bridge.share('Результат', 'https://example.test/game');
ok(maxPayload?.text === 'Результат' && maxPayload?.link === 'https://example.test/game', 'share предпочитает внутренний shareMaxContent MAX');
window.WebApp = { shareContent() { throw new Error('unsupported'); }, openMaxLink(url) { maxLink = url; } };
await bridge.share('Результат', 'https://example.test/game');
ok(/^https:\/\/max\.ru\/:share\?text=/.test(maxLink || ''), 'fallback MAX deep-link открывается через openMaxLink');

window.WebApp = {
  ready() { throw new Error('MAX bridge is not attached yet'); },
  expand() { throw new Error('MAX bridge is not attached yet'); },
  HapticFeedback: { selectionChanged() { throw new Error('MAX bridge is not attached yet'); } },
};
ok(doesNotThrow(() => bridge.ready()), 'неподготовленный MAX ready не обрывает запуск хаба');
ok(doesNotThrow(() => bridge.expand()), 'неподготовленный MAX expand не обрывает запуск хаба');
ok(doesNotThrow(() => bridge.haptic('selection')), 'неподготовленный MAX haptic не обрывает интерфейс');

let readyOwner = null;
window.WebApp = { ready() { readyOwner = this; } };
bridge.ready();
ok(readyOwner === window.WebApp, 'MAX методы вызываются с корректным контекстом WebApp');

if (fails) { console.error(`\nПровалено: ${fails}`); process.exit(1); }
console.log('\nHandshake iframe и MAX share routing стабильны.');

function doesNotThrow(fn) {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}
