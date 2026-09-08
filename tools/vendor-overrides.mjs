#!/usr/bin/env node
/** Stable production adaptations applied after upstream vendor.mjs. */
import { copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const copy = (src, dst) => copyFileSync(join(ROOT, 'tools', 'overrides', src), join(ROOT, dst));

for (const [src, dst] of [
  ['merge-script.js', 'games/merge/script.js'],
  ['merge-index.html', 'games/merge/index.html'],
  ['quiz-script.js', 'games/quiz/script.js'],
  ['reaction-index.html', 'games/reaction/index.html'],
  ['reaction-style.css', 'games/reaction/style.css'],
  ['snake-index.html', 'games/snake/index.html'],
  ['snake-style.css', 'games/snake/style.css'],
]) copy(src, dst);

console.log('Stable production vendor overrides применены.');
