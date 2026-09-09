#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES as MANIFEST } from '../js/games.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = join(ROOT, 'games');
const FORBIDDEN = /\.(png|jpe?g|gif|webp|mp3|wav|ogg|ttf|woff2?)$/i;
const manifestById = new Map(MANIFEST.map((game) => [game.id, game]));
let errors = 0;
let warns = 0;
const err = (message) => { console.log(`  ✗ ${message}`); errors++; };
const warn = (message) => { console.log(`  ! ${message}`); warns++; };

console.log('Проверка хаба\n');
for (const id of readdirSync(GAMES)) {
  const dir = join(GAMES, id);
  if (!statSync(dir).isDirectory()) continue;
  const htmlPath = join(dir, 'index.html');
  if (!existsSync(htmlPath)) {
    err(`${id}: нет index.html`);
    continue;
  }

  const html = readFileSync(htmlPath, 'utf8');
  const manifest = manifestById.get(id);
  if (manifest?.modulePath) {
    if (!html.includes('topWindow.location.replace')) err(`${id}: module handoff must replace the top-level WebView`);
    if (!html.includes(manifest.modulePath)) err(`${id}: module handoff does not target ${manifest.modulePath}`);
    if (html.includes('_boot.js')) err(`${id}: module handoff must not initialize the iframe bridge`);
  } else if (!html.includes('_boot.js')) {
    err(`${id}: не встроен _boot.js`);
  }

  if (!/<meta[^>]+viewport/i.test(html)) warn(`${id}: нет viewport meta`);
  const refs = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map((match) => match[1]).filter(Boolean);
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

  for (const name of readdirSync(dir).filter((file) => file.endsWith('.css'))) {
    const css = readFileSync(join(dir, name), 'utf8');
    if (/(?:@import\s+[^;]*https?:\/\/|url\(\s*["']?https?:\/\/)/i.test(css)) {
      err(`${id}/${name}: внешний CSS runtime-ресурс запрещён`);
    }
  }
  console.log(`  ok ${id}`);
}

const overrides = [
  ['games/merge/script.js', 'tools/overrides/merge-script.js'],
  ['games/merge/index.html', 'tools/overrides/merge-index.html'],
  ['games/merge/style.css', 'tools/overrides/merge-style.css'],
  ['games/quiz/index.html', 'tools/overrides/quiz-index.html'],
  ['games/quiz/script.js', 'tools/overrides/quiz-script.js'],
  ['games/quiz/style.css', 'tools/overrides/quiz-style.css'],
  ['games/reaction/index.html', 'tools/overrides/reaction-index.html'],
  ['games/reaction/style.css', 'tools/overrides/reaction-style.css'],
  ['games/reaction/script.js', 'tools/overrides/reaction-script.js'],
  ['games/snake/index.html', 'tools/overrides/snake-index.html'],
  ['games/snake/style.css', 'tools/overrides/snake-style.css'],
  ['games/snake/script.js', 'tools/overrides/snake-script.js'],
  ['games/sapper/style.css', 'tools/overrides/sapper-style.css'],
  ['games/echo/style.css', 'tools/overrides/echo-style.css'],
  ['games/echo/script.js', 'tools/overrides/echo-script.js'],
  ['games/memory/style.css', 'tools/overrides/memory-style.css'],
  ['games/memory/script.js', 'tools/overrides/memory-script.js'],
];
for (const [actual, canonical] of overrides) {
  if (readFileSync(join(ROOT, actual), 'utf8') !== readFileSync(join(ROOT, canonical), 'utf8')) {
    err(`${actual}: расходится с production override; npm run vendor будет нерепродуцируем`);
  }
}

let total = 0;
const walk = (dir) => {
  for (const file of readdirSync(dir)) {
    const path = join(dir, file);
    statSync(path).isDirectory() ? walk(path) : total += statSync(path).size;
  }
};
walk(GAMES);
console.log(`\nВсего игр: ${readdirSync(GAMES).filter((file) => statSync(join(GAMES, file)).isDirectory()).length}`);
console.log(`Вес games/: ${(total / 1024).toFixed(0)} КБ`);
console.log(`\n${errors ? `ОШИБОК: ${errors}` : 'Ошибок нет'}${warns ? `, предупреждений: ${warns}` : ''}`);
process.exit(errors ? 1 : 0);
