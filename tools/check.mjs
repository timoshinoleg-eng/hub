#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = join(ROOT, 'games');
const FORBIDDEN = /\.(png|jpe?g|gif|webp|mp3|wav|ogg|ttf|woff2?)$/i;
let errors = 0;
let warns = 0;
const err = (m) => { console.log(`  ✗ ${m}`); errors++; };
const warn = (m) => { console.log(`  ! ${m}`); warns++; };

console.log('Проверка хаба\n');
for (const id of readdirSync(GAMES)) {
  const dir = join(GAMES, id);
  if (!statSync(dir).isDirectory()) continue;
  const htmlPath = join(dir, 'index.html');
  if (!existsSync(htmlPath)) { err(`${id}: нет index.html`); continue; }
  const html = readFileSync(htmlPath, 'utf8');
  if (!html.includes('_boot.js')) err(`${id}: не встроен _boot.js`);
  if (!/<meta[^>]+viewport/i.test(html)) warn(`${id}: нет viewport meta`);

  const refs = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
  for (const ref of refs) {
    if (/^https?:\/\//i.test(ref)) {
      err(`${id}: внешний runtime-ресурс запрещён ${ref}`);
      continue;
    }
    if (/^(data:|#|mailto:)/.test(ref)) continue;
    const target = resolve(dir, ref.split('?')[0].split('#')[0]);
    if (!existsSync(target)) err(`${id}: битая ссылка ${ref}`);
    else if (FORBIDDEN.test(ref)) err(`${id}: чужой ассет не удалён ${ref}`);
  }
  console.log(`  ok ${id}`);
}

for (const [actual, canonical] of [
  ['games/merge/script.js', 'tools/overrides/merge-script.js'],
  ['games/merge/index.html', 'tools/overrides/merge-index.html'],
  ['games/quiz/script.js', 'tools/overrides/quiz-script.js'],
]) {
  if (readFileSync(join(ROOT, actual), 'utf8') !== readFileSync(join(ROOT, canonical), 'utf8')) {
    err(`${actual}: расходится с production override; npm run vendor будет нерепродуцируем`);
  }
}

let total = 0;
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p) : (total += statSync(p).size);
  }
};
walk(GAMES);
console.log(`\nВсего игр: ${readdirSync(GAMES).filter((f) => statSync(join(GAMES, f)).isDirectory()).length}`);
console.log(`Вес games/: ${(total / 1024).toFixed(0)} КБ`);
console.log(`\n${errors ? `ОШИБОК: ${errors}` : 'Ошибок нет'}${warns ? `, предупреждений: ${warns}` : ''}`);
process.exit(errors ? 1 : 0);
