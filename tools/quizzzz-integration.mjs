#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../js/games.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const quiz = GAMES.find((game) => game.id === 'quiz');
assert.ok(quiz, 'quiz catalogue entry exists');
assert.equal(quiz.title, 'Квизик', 'Hub exposes full Quizzzz product');
assert.equal(quiz.modulePath, '/quiz/', 'Quizzzz uses the same-origin /quiz/ mount');
assert.equal(quiz.cfg?.daily, undefined, 'server-authoritative Quizzzz Daily is not mixed with arcade Daily');

const redirect = read('games/quiz/index.html');
assert.ok(redirect.includes("new URL('/quiz/'"), 'legacy Hub quiz routes to /quiz/');
assert.ok(redirect.includes("searchParams.set('from', 'hub')"), 'handoff marks Hub origin for return navigation');
assert.ok(redirect.includes('topWindow.location.replace'), 'handoff escapes the iframe into the top-level Mini App');
assert.ok(!redirect.includes('../_boot.js'), 'module handoff does not start the legacy iframe bridge');
assert.equal(redirect, read('tools/overrides/quiz-index.html'), 'Quizzzz handoff is vendor-reproducible');

const index = read('index.html');
const runtime = read('runtime-config.js');
assert.ok(index.includes('<script src="runtime-config.js"></script>'), 'Hub loads deploy-time runtime config');
assert.ok(index.includes('Object.assign({'), 'runtime config is merged over safe defaults');
assert.ok(runtime.includes('window.HUB_CONFIG'), 'runtime config file has safe local defaults');

const docs = read('QUIZZZZ_INTEGRATION.md');
assert.ok(docs.includes('existing Quizzzz MAX bot remains the single production bot'), 'single bot ownership is documented');
assert.ok(docs.includes('Hub Node bot must be disabled'), 'legacy Hub bot is forbidden in unified production');
assert.ok(docs.includes('/quiz/'), 'gateway mount is documented');
assert.ok(docs.includes('feat/hub-integration'), 'paired Quizzzz branch is documented');

console.log('Quizzzz integration contract: ok');
