#!/usr/bin/env node
/** Production overrides, которые применяются после upstream vendor.mjs. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function replaceExact(path, from, to) {
  let s = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  if (!s.includes(from)) throw new Error(`override не применён: ${path}\nожидалось: ${from}`);
  s = s.replace(from, to);
  writeFileSync(path, s, 'utf8');
}

// Merge intentionally owns a stable implementation: upstream version has
// recursion/game-over/no-op move bugs. Vendor still supplies its HTML/CSS.
const canonicalMerge = readFileSync(join(ROOT, 'tools', 'overrides', 'merge-script.js'), 'utf8');
writeFileSync(join(ROOT, 'games', 'merge', 'script.js'), canonicalMerge, 'utf8');

const mergeHtml = join(ROOT, 'games', 'merge', 'index.html');
let html = readFileSync(mergeHtml, 'utf8').replace(/\r\n/g, '\n');
html = html.replace('<html lang="en" dir="ltr">', '<html lang="ru" dir="ltr">');
html = html.replace('<title>Talha - 2048 Game</title>', '<title>Мердж</title>');
html = html.replace(/\s*<link rel="icon"[^>]*>/g, '');
html = html.replace('<h1>2048</h1>', '<h1>Мердж</h1>');
html = html.replace('<div class="score-title">score</div>', '<div class="score-title">Счёт</div>');
html = html.replace(/<span id="result">[\s\S]*?<\/span>/, '<span id="result" aria-live="polite"></span>');
writeFileSync(mergeHtml, html, 'utf8');

replaceExact(
  join(ROOT, 'games', 'quiz', 'script.js'),
  'quizData.sort(() => __hubRand() - 0.5);',
  'shuffleArray(quizData);'
);

console.log('Production vendor overrides применены.');
