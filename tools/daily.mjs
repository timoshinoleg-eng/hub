#!/usr/bin/env node
/**
 * daily.mjs — проверяет «пазл дня»: одинаковый ?seed => одинаковая раскладка
 * у сапёра и викторины, разный seed => разная. Гоняет реальный script.js
 * игр в изолированном vm с заглушками DOM, без браузера.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAPPER = join(ROOT, 'games', 'sapper', 'script.js');
const QUIZ = join(ROOT, 'games', 'quiz', 'script.js');
const SEED_A = '2026-09-06';
const SEED_B = '2026-01-01';

function mkEl() {
  return {
    innerHTML: '', textContent: '', value: '', type: '', name: '', checked: false,
    style: {}, dataset: {},
    classList: { contains: () => false, add() {}, remove() {} },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, append() {}, removeChild() {},
    setAttribute() {}, getAttribute: () => null,
    querySelector: () => mkEl(), querySelectorAll: () => [],
  };
}

function runGame(file, seed, exportExpr, pre = '') {
  const code = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const wrapped = code + `\n;globalThis.__run = function () { ${pre} }; globalThis.__export = () => (${exportExpr});`;
  const sandbox = {
    Math, Date, console, URLSearchParams, JSON,
    location: { search: seed ? `?seed=${seed}` : '' },
    window: { parent: { postMessage() {} }, addEventListener() {}, onload: null },
    document: {
      getElementById: () => mkEl(),
      createElement: () => mkEl(),
      createTextNode: () => mkEl(),
      querySelector: () => mkEl(),
      addEventListener() {},
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(wrapped, sandbox, { filename: file });
  sandbox.__run();
  return sandbox.__export();
}

let fails = 0;
function ok(cond, msg) {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fails++;
}

// ── Сапёр ──
const sa1 = runGame(SAPPER, SEED_A, 'minesLocation', 'setMines();');
const sa2 = runGame(SAPPER, SEED_A, 'minesLocation', 'setMines();');
const sa3 = runGame(SAPPER, SEED_B, 'minesLocation', 'setMines();');
const sa0 = runGame(SAPPER, null, 'minesLocation', 'setMines();');

ok(sa1.length === 10, `сапёр: 10 мин (seed ${SEED_A})`);
ok(new Set(sa1).size === 10, 'сапёр: мины без дублей');
ok(JSON.stringify(sa1) === JSON.stringify(sa2), 'сапёр: одинаковый seed => одинаковая раскладка');
ok(JSON.stringify(sa1) !== JSON.stringify(sa3), `сапёр: разный seed => разная раскладка (${SEED_A} vs ${SEED_B})`);
ok(sa0.length === 10, 'сапёр: без seed раскладка строится (Math.random)');

// ── Викторина ──
const q1 = runGame(QUIZ, SEED_A, 'quizData.map(q => q.question)');
const q2 = runGame(QUIZ, SEED_A, 'quizData.map(q => q.question)');
const q3 = runGame(QUIZ, SEED_B, 'quizData.map(q => q.question)');

ok(q1.length === 20, 'викторина: 20 вопросов');
ok(JSON.stringify(q1) === JSON.stringify(q2), 'викторина: одинаковый seed => одинаковый порядок');
ok(JSON.stringify(q1) !== JSON.stringify(q3), `викторина: разный seed => разный порядок (${SEED_A} vs ${SEED_B})`);

console.log(fails === 0 ? '\nПазл дня детерминирован. Всё ок.' : `\nПровалено проверок: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
