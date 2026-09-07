#!/usr/bin/env node
/**
 * duel.mjs — проверяет чистую логику дуэлей (js/duel.js): сравнение счёта
 * с челленджем из deep link, с учётом higherIsBetter. Без браузера.
 */
import { duelResult } from '../js/duel.js';

let fails = 0;
function ok(cond, msg) {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fails++;
}

// higherIsBetter (большинство игр)
const win = duelResult(12, 10);
ok(win && win.won === true && win.tie === false, 'выше лучше: 12 >= 10 ⇒ победа');
const lose = duelResult(8, 10);
ok(lose && lose.won === false, 'выше лучше: 8 < 10 ⇒ поражение');
const tie = duelResult(10, 10);
ok(tie && tie.won === true && tie.tie === true, 'равенство считается победой (>=)');
ok(duelResult(5, null) === null, 'нет челленджа ⇒ null');

// lowerIsBetter (Память: меньше ходов — лучше)
const memWin = duelResult(8, 12, false);
ok(memWin && memWin.won === true, 'ниже лучше: 8 <= 12 ⇒ победа');
const memLose = duelResult(15, 12, false);
ok(memLose && memLose.won === false, 'ниже лучше: 15 > 12 ⇒ поражение');
const memTie = duelResult(12, 12, false);
ok(memTie && memTie.won === true && memTie.tie === true, 'ниже лучше: равенство ⇒ победа');

console.log(fails === 0 ? '\nЛогика дуэлей ок.' : `\nПровалено: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
