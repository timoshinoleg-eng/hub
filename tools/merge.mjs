#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(join(ROOT, 'games', 'merge', 'script.js'), 'utf8');
const sandbox = { document: { addEventListener() {} }, console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'games/merge/script.js' });

let fails = 0;
function ok(cond, msg) {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fails++;
}

let r = sandbox.__mergeLine([2, 2, 2, 2]);
ok(JSON.stringify(r.line) === JSON.stringify([4, 4, 0, 0]) && r.gained === 8, 'каждая плитка сливается не более одного раза');

r = sandbox.__mergeApplyMove([2, 2, 4, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'right');
ok(JSON.stringify(r.board.slice(0, 4)) === JSON.stringify([0, 4, 4, 8]), 'right не склеивает через границы строки');

const dead = [2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];
ok(sandbox.__mergeCanMove(dead) === false, 'полное поле без соседних пар = game over');
const alive = [2,2,4,8,16,32,64,128,2,4,8,16,32,64,128,256];
ok(sandbox.__mergeCanMove(alive) === true, 'полное поле с доступным merge не считается game over');

r = sandbox.__mergeApplyMove([2,4,8,16,0,0,0,0,0,0,0,0,0,0,0,0], 'left');
ok(r.changed === false && r.gained === 0, 'no-op swipe не считается ходом и не должен создавать новую плитку');

if (fails) {
  console.error(`\nПровалено: ${fails}`);
  process.exit(1);
}
console.log('\nMerge mechanics проходят контрактные проверки.');
