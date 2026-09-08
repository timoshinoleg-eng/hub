#!/usr/bin/env node
/** Stable production adaptations applied after upstream vendor.mjs. */
import { copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const copy=(src,dst)=>copyFileSync(join(ROOT,'tools','overrides',src),join(ROOT,dst));
for(const [src,dst] of [
  ['merge-script.js','games/merge/script.js'],['merge-index.html','games/merge/index.html'],['merge-style.css','games/merge/style.css'],
  ['quiz-script.js','games/quiz/script.js'],['quiz-style.css','games/quiz/style.css'],
  ['reaction-index.html','games/reaction/index.html'],['reaction-style.css','games/reaction/style.css'],['reaction-script.js','games/reaction/script.js'],
  ['snake-index.html','games/snake/index.html'],['snake-style.css','games/snake/style.css'],['snake-script.js','games/snake/script.js'],
  ['echo-index.html','games/echo/index.html'],['echo-style.css','games/echo/style.css'],['echo-script.js','games/echo/script.js'],
  ['memory-index.html','games/memory/index.html'],['memory-style.css','games/memory/style.css'],['memory-script.js','games/memory/script.js'],
])copy(src,dst);
console.log('Stable production vendor overrides применены.');
