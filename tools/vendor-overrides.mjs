#!/usr/bin/env node
/** Stable production adaptations applied after upstream vendor.mjs. */
import { copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const copy = (src, dst) => copyFileSync(join(ROOT, 'tools', 'overrides', src), join(ROOT, dst));

copy('merge-script.js', 'games/merge/script.js');
copy('merge-index.html', 'games/merge/index.html');
copy('quiz-script.js', 'games/quiz/script.js');

console.log('Stable production vendor overrides применены.');
