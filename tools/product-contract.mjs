#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../js/games.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

assert.equal(GAMES.length, 7, 'release scope remains seven games');
assert.ok(GAMES.every((g) => g.enabled), 'all release games must be explicitly enabled');
for (const g of GAMES) {
  assert.ok(g.accent && g.accent2, `${g.id}: visual accent metadata`);
  assert.ok(g.genre && g.length, `${g.id}: genre and session length metadata`);
  assert.ok(g.howTo && g.howTo.length >= 20, `${g.id}: first-run onboarding copy`);
}
assert.ok(GAMES.filter((g) => g.cfg?.daily).length >= 2, 'at least two daily-capable games');
assert.equal(GAMES.find((g) => g.id === 'memory')?.cfg?.higherIsBetter, false, 'memory keeps lower-is-better scoring');

const hub = read('js/main.js');
const hubCss = read('css/hub.css');
assert.ok(hub.includes("from './progress.js'"), 'hub has local progression');
assert.ok(hub.includes("track('new_record'") && hub.includes("track('daily_complete'"), 'record and daily retention events');
assert.ok(hub.includes("bridge.haptic('selection')"), 'MAX haptic feedback stays integrated');
for (const token of ['daily-card', 'game-grid', 'record-pill', 'game-tip', 'confetti']) {
  assert.ok(hubCss.includes(token), `shell keeps ${token} visual layer`);
}

const reaction = read('games/reaction/script.js');
assert.ok(reaction.includes('DURATION=30000') && reaction.includes('combo') && reaction.includes('function pace()'), 'reaction keeps timer/combo/adaptive pace');

const echo = read('games/echo/script.js');
assert.ok(echo.includes('completed=Math.max(0,level-1)') && echo.includes('__hubDone=false'), 'echo scores completed levels and is restart-safe');
assert.equal((read('games/echo/index.html').match(/id="status"/g) || []).length, 0, 'echo has no duplicate legacy status id');

const memory = read('games/memory/script.js');
assert.ok(memory.includes('function shuffle(a)') && memory.includes("board.innerHTML=''"), 'memory has clean Fisher-Yates restartable board');
assert.ok(!read('games/memory/index.html').includes('<li class="card">'), 'memory no longer ships giant static card markup');

const snake = read('games/snake/script.js');
assert.ok(snake.includes('while(occupied(x,y))'), 'snake food cannot spawn inside snake');
assert.ok(!snake.includes('hub-again') && !snake.includes('location.reload'), 'snake uses hub result loop only');
assert.ok(snake.includes("visibilitychange"), 'snake pauses while hidden');

const quiz = read('games/quiz/script.js');
assert.ok(quiz.includes('questionBank.slice(0,10)'), 'daily quiz is intentionally ten questions');
assert.ok(quiz.includes("button.classList.add('correct')") && quiz.includes("button.classList.add('wrong')"), 'quiz has immediate answer feedback');
assert.ok(!read('games/quiz/index.html').includes('id="submit"'), 'quiz has no submit-button friction');

const sapper = read('games/sapper/script.js');
assert.ok(sapper.includes("aria-pressed") && sapper.includes('opened-count'), 'sapper exposes clear flag mode and progress HUD');

const merge = read('games/merge/script.js');
assert.ok(merge.includes("cell.textContent=v?String(v):''"), 'merge empty cells are visually empty');
assert.ok(merge.includes("Math.random()<.9?2:4"), 'merge spawns standard 2/4 tiles');

console.log('product/playability contract: ok');
