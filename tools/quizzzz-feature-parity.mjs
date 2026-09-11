#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../js/games.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = readFileSync(join(ROOT, 'QUIZZZZ_FEATURE_PARITY.md'), 'utf8');
const quiz = GAMES.find((game) => game.id === 'quiz');

assert.ok(quiz?.modulePath === '/quiz/', 'Hub catalogue keeps Quizzzz as a full top-level module');
assert.ok(!quiz?.cfg?.daily, 'Hub arcade Daily does not replace Quizzzz server Daily');
for (const capability of [
  'Quick Game', 'Quiz Daily', 'quiz packs', 'profile level', 'XP', 'streak',
  'mastery', 'achievements', 'weekly missions', 'league', 'leaderboard',
  'duel', 'rematch', 'legacy challenge', 'MAX and Telegram', 'PostgreSQL',
]) {
  assert.ok(docs.toLowerCase().includes(capability.toLowerCase()), `${capability}: full Quizzzz parity is release-gated`);
}
assert.ok(docs.includes('NO-GO'), 'feature loss is an explicit release blocker');
console.log('Quizzzz full feature-parity contract: ok');
