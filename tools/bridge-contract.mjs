#!/usr/bin/env node
/** Проверяет одноразовый handshake games/_boot.js ↔ parent. */
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
  parent,
  setInterval: () => { intervals++; return intervals; },
  document: {
    currentScript,
    querySelector: () => null,
    createElement: () => ({ textContent: '' }),
    head: { appendChild() {} },
    body: { style: {} },
    addEventListener() {},
  },
  window: {
    addEventListener(type, fn) { if (type === 'message') messageHandler = fn; },
  },
  console,
};
sandbox.window.window = sandbox.window;

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'games/_boot.js' });

let fails = 0;
function ok(cond, msg) {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fails++;
}

ok(typeof messageHandler === 'function', 'message handler зарегистрирован');
ok(messages.filter((m) => m.type === 'ready').length === 1, 'ready отправлен ровно один раз при загрузке');

messageHandler({
  source: parent,
  data: { __hub: 1, type: 'cfg', game: 'merge', cfg: {} },
});
ok(intervals === 1, 'первый cfg запускает ровно один polling interval');
ok(messages.filter((m) => m.type === 'ready').length === 1, 'start не отправляет повторный ready');

messageHandler({
  source: parent,
  data: { __hub: 1, type: 'cfg', game: 'merge', cfg: {} },
});
ok(intervals === 1, 'повторный cfg идемпотентен');

messageHandler({
  source: {},
  data: { __hub: 1, type: 'cfg', game: 'merge', cfg: {} },
});
ok(intervals === 1, 'cfg от чужого window игнорируется');

if (fails) {
  console.error(`\nПровалено: ${fails}`);
  process.exit(1);
}
console.log('\nHandshake iframe стабилен.');
