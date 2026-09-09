#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../js/games.js';
import { isQuizzzzStartParam, quizzzzLaunchUrl } from '../js/launch-router.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const quiz = GAMES.find((game) => game.id === 'quiz');
assert.ok(quiz, 'quiz catalogue entry exists');
assert.equal(quiz.title, 'Квизик', 'Hub exposes full Quizzzz product');
assert.equal(quiz.modulePath, '/quiz/', 'Quizzzz uses the same-origin /quiz/ mount');
assert.equal(quiz.cfg?.daily, undefined, 'server-authoritative Quizzzz Daily is not mixed with arcade Daily');

for (const payload of ['daily', 'league', 'leaderboard', 'challenge_new', 'd_abcDEF_123', 'challenge_ABCD']) {
  assert.equal(isQuizzzzStartParam(payload), true, `${payload}: legacy Quizzzz launch intent is recognized`);
  const target = new URL(quizzzzLaunchUrl(payload, 'https://hub.example'));
  assert.equal(target.pathname, '/quiz/');
  assert.equal(target.searchParams.get('from'), 'hub');
  assert.equal(target.searchParams.get('startapp'), payload);
}
for (const payload of ['', 'gmerge_s100', 'unknown', 'd bad', 'x'.repeat(513)]) {
  assert.equal(isQuizzzzStartParam(payload), false, `${payload.slice(0, 20)}: non-Quizzzz launch intent is not stolen`);
}

const redirect = read('games/quiz/index.html');
assert.ok(redirect.includes("new URL('/quiz/'"), 'legacy Hub quiz routes to /quiz/');
assert.ok(redirect.includes("searchParams.set('from', 'hub')"), 'handoff marks Hub origin for return navigation');
assert.ok(redirect.includes('topWindow.location.replace'), 'handoff escapes the iframe into the top-level Mini App');
assert.ok(!redirect.includes('../_boot.js'), 'module handoff does not start the legacy iframe bridge');
assert.equal(redirect, read('tools/overrides/quiz-index.html'), 'Quizzzz handoff is vendor-reproducible');

const index = read('index.html');
const bootstrap = read('js/bootstrap.js');
const bridge = read('js/bridge.js');
const runtime = read('runtime-config.js');
const track = read('js/track.js');
const main = read('js/main.js');
assert.ok(index.includes('<script src="runtime-config.js"></script>'), 'Hub loads deploy-time runtime config');
assert.ok(index.includes('Object.assign({'), 'runtime config is merged over safe defaults');
assert.ok(runtime.includes('window.HUB_CONFIG'), 'runtime config file has safe local defaults');
assert.ok(index.includes('js/bootstrap.js') && !index.includes('js/main.js'), 'launch routing runs before the Hub application boot');
assert.ok(bootstrap.includes('routeQuizzzzLaunch()') && bootstrap.includes("import('./main.js')"), 'bootstrap skips Hub main for Quizzzz launch intents');
for (const key of ['WebAppStartParam', 'tgWebAppStartParam', 'startapp', 'start_param']) {
  assert.ok(bridge.includes(key), `Hub bridge reads ${key} launch parameter form`);
}
assert.ok(track.includes('export const subscriptionAvailable'), 'Hub exposes subscription backend availability');
assert.ok(main.includes('!subscriptionAvailable()'), 'notification CTA is suppressed when unified phase one has no Hub backend');

const docs = read('QUIZZZZ_INTEGRATION.md');
assert.ok(docs.includes('existing Quizzzz MAX bot remains the single production bot'), 'single bot ownership is documented');
assert.ok(docs.includes('Hub Node bot must be disabled'), 'legacy Hub bot is forbidden in unified production');
assert.ok(docs.includes('/quiz/'), 'gateway mount is documented');
assert.ok(docs.includes('feat/hub-integration'), 'paired Quizzzz branch is documented');

console.log('Quizzzz integration contract v3: ok');
