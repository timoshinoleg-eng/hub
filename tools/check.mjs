#!/usr/bin/env node
/**
 * check.mjs — smoke-проверка после вендоринга. Ловит три класса ошибок:
 *   1. битые относительные ссылки в index.html игр (после копирования)
 *   2. чужие ассеты, которые должны были быть удалены
 *   3. отсутствующий _boot.js
 * Запуск: node tools/check.mjs
 */
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
  if (!/<meta[^>]+viewport/i.test(html)) warn(`${id}: нет viewport meta — на телефоне будет мелко`);

  // Локальные ссылки: src="..." и href="..." без протокола и без data:
  const refs = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => u && !/^(https?:|data:|#|mailto:)/.test(u));

  for (const ref of refs) {
    const target = resolve(dir, ref.split('?')[0].split('#')[0]);
    if (!existsSync(target)) err(`${id}: битая ссылка ${ref}`);
    else if (FORBIDDEN.test(ref)) err(`${id}: чужой ассет не удалён ${ref}`);
  }

  console.log(`  ok ${id}${refs.length ? ` · ссылок ${refs.length}` : ''}`);
}

// Итог по весу — главный аргумент «максимально быстро перенести»
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
