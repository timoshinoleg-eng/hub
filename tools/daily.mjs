#!/usr/bin/env node
/**
 * Детерминизм «пазла дня»: одинаковый ?seed обязан давать одинаковую игру.
 *
 * Раньше здесь проверялись только сапёр и викторина, потому что детерминированный
 * генератор жил текстом внутри tools/vendor.mjs и подставлялся правками в их
 * script.js. Теперь генератор один на все игры — games/_rng.js, — и проверка
 * распространяется на те игры, которые манифест помечает как daily, но которые
 * seed всё равно игнорировали: эхо и «найди пару».
 *
 * Золотые раскладки зафиксированы осознанно. Перенос алгоритма из vendor.mjs
 * не должен разъехать пазл дня у игроков, которые уже видели сегодняшний: если
 * эти строки поменяются, тест упадёт и правку придётся проговорить отдельно.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RNG = join(ROOT, 'games', '_rng.js');
const SAPPER = join(ROOT, 'games', 'sapper', 'script.js');
const QUIZ = join(ROOT, 'games', 'quiz', 'script.js');
const ECHO = join(ROOT, 'games', 'echo', 'script.js');
const MEMORY = join(ROOT, 'games', 'memory', 'script.js');
const SEED_A = '2026-09-06';
const SEED_B = '2026-01-01';

function mkEl() {
  return {
    innerHTML: '', textContent: '', value: '', type: '', name: '', checked: false,
    disabled: false, children: [], style: {}, dataset: {},
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    appendChild(x) { this.children.push(x); }, append(x) { this.children.push(x); },
    removeChild() {}, setAttribute() {}, getAttribute: () => null,
    querySelector: () => mkEl(), querySelectorAll: () => [],
  };
}

/**
 * Запускает игру в vm с шимом и возвращает значение выражения.
 *
 * `Math: Object.create(Math)` — не украшение: шим подменяет Math.random, а
 * голый Math в песочнице указывал бы на глобальный объект Node, и тест сломал
 * бы сам себя (и любой следующий за ним) недетерминированной подменой. С
 * прототипом присваивание создаёт собственное свойство песочницы, а остальные
 * методы Math достаются по цепочке.
 */
function runGame(file, seed, exportExpr, pre = '') {
  const game = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const rng = readFileSync(RNG, 'utf8').replace(/\r\n/g, '\n');
  const wrapped = rng + '\n' + game
    + `\n;globalThis.__run=function(){${pre}};globalThis.__export=()=>(${exportExpr});`;
  const sandbox = {
    Math: Object.create(Math),
    Date, console, URLSearchParams, JSON, setTimeout() {},
    location: { search: seed ? `?seed=${seed}` : '' },
    window: { parent: { postMessage() {} }, addEventListener() {}, onload: null },
    document: {
      getElementById: () => mkEl(), createElement: () => mkEl(),
      createTextNode: () => mkEl(), querySelector: () => mkEl(),
      querySelectorAll: () => [], addEventListener() {},
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
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) fails++;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Сапёр ───────────────────────────────────────────────────────────────────
const sa1 = runGame(SAPPER, SEED_A, 'minesLocation', 'setMines();');
const sa2 = runGame(SAPPER, SEED_A, 'minesLocation', 'setMines();');
const sa3 = runGame(SAPPER, SEED_B, 'minesLocation', 'setMines();');
ok(sa1.length === 10 && new Set(sa1).size === 10, 'сапёр: 10 различных мин');
ok(same(sa1, sa2), 'сапёр: одинаковый seed => одинаковая раскладка');
ok(!same(sa1, sa3), 'сапёр: разный seed => разная раскладка');
ok(same(sa1, ['2-2', '6-6', '0-0', '4-3', '5-0', '4-1', '5-7', '3-6', '7-3', '0-4']),
  'сапёр: раскладка за 2026-09-06 совпадает с эталоном до перехода на шим');

// ── Викторина ──────────────────────────────────────────────────────────────
const q1 = runGame(QUIZ, SEED_A, 'quizData.map(q=>q.question)');
const q2 = runGame(QUIZ, SEED_A, 'quizData.map(q=>q.question)');
const q3 = runGame(QUIZ, SEED_B, 'quizData.map(q=>q.question)');
ok(q1.length === 10, 'викторина: короткий daily из 10 вопросов');
ok(same(q1, q2), 'викторина: одинаковый seed => одинаковый набор и порядок');
ok(!same(q1, q3), 'викторина: разный seed => другой набор/порядок');
ok(q1[0] === 'Какой газ преобладает в атмосфере Земли?',
  'викторина: первый вопрос за 2026-09-06 совпадает с эталоном до перехода на шим');
const quizSource = readFileSync(QUIZ, 'utf8');
ok(quizSource.includes('shuffleArray(questionBank)') && !quizSource.includes('.sort(() => Math.random'),
  'вопросы перемешиваются Fisher–Yates, а не engine-dependent Array.sort');

// ── Эхо и «найди пару»: daily в манифесте, но seed игнорировали ──────────────
const e1 = runGame(ECHO, SEED_A, 'sequence', 'nextLevel(0);');
const e2 = runGame(ECHO, SEED_A, 'sequence', 'nextLevel(0);');
const e3 = runGame(ECHO, SEED_B, 'sequence', 'nextLevel(0);');
ok(same(e1, e2), 'эхо: одинаковый seed => одинаковая последовательность');
ok(!same(e1, e3), 'эхо: разный seed => другая последовательность');

const m1 = runGame(MEMORY, SEED_A, 'shuffle([1,2,3,4,5,6,7,8])');
const m2 = runGame(MEMORY, SEED_A, 'shuffle([1,2,3,4,5,6,7,8])');
const m3 = runGame(MEMORY, SEED_B, 'shuffle([1,2,3,4,5,6,7,8])');
ok(same(m1, m2), 'найди пару: одинаковый seed => одинаковая раскладка');
ok(!same(m1, m3), 'найди пару: разный seed => другая раскладка');

// ── Без seed всё остаётся по-настоящему случайным ──────────────────────────
const u1 = runGame(MEMORY, '', 'shuffle([1,2,3,4,5,6,7,8])');
const u2 = runGame(MEMORY, '', 'shuffle([1,2,3,4,5,6,7,8])');
ok(!same(u1, u2), 'без seed раскладка всё равно случайна: шим не замедляет обычную игру');

console.log(fails === 0 ? '\nвсе проверки детерминизма прошли. см. ok.' : `\nпровалено проверок: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
