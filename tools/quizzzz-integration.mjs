#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../js/games.js';
import { isQuizzzzStartParam, quizzzzLaunchUrl } from '../js/launch-router.js';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const quiz = GAMES.find((g) => g.id === 'quiz');
assert.equal(quiz?.title, 'Квизик');
assert.equal(quiz?.modulePath, '/quiz/');
assert.equal(quiz?.cfg?.daily, undefined);
for (const payload of ['daily','league','leaderboard','challenge_new','d_abcDEF_123','challenge_ABCD']) {
  assert.equal(isQuizzzzStartParam(payload), true, payload);
  const url = new URL(quizzzzLaunchUrl(payload, 'https://hub.example'));
  assert.equal(url.pathname, '/quiz/');
  assert.equal(url.searchParams.get('startapp'), payload);
}
for (const payload of ['', 'gmerge_s100', 'unknown', 'd bad', 'x'.repeat(513)]) assert.equal(isQuizzzzStartParam(payload), false);
const handoff = read('games/quiz/index.html');
assert.ok(handoff.includes("new URL('/quiz/'") && handoff.includes('topWindow.location.replace'));
const caddy = read('deploy/Caddyfile.hub');
assert.ok(caddy.includes('handle_path /quiz/*') && caddy.includes('reverse_proxy app:8000'));
console.log('Quizzzz full-product integration contract: ok');
