#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../js/games.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

assert.equal(GAMES.length, 12, 'release scope is twelve games after wave 2');
assert.ok(GAMES.every((g) => g.enabled), 'all release games must be explicitly enabled');
for (const g of GAMES) {
  assert.ok(g.accent && g.accent2, `${g.id}: visual accent metadata`);
  assert.ok(g.genre && g.length, `${g.id}: genre and session length metadata`);
  assert.ok(g.howTo && g.howTo.length >= 20, `${g.id}: first-run onboarding copy`);
  assert.ok(/^[a-z]+$/.test(g.icon || ''), `${g.id}: local SVG icon id`);
  assert.ok(g.cfg?.injectCss?.includes('font-size:10px'), `${g.id}: embedded mobile readability theme`);
}
assert.ok(GAMES.filter((g) => g.cfg?.daily).length >= 2, 'at least two daily-capable games');
assert.equal(GAMES.find((g) => g.id === 'memory')?.cfg?.higherIsBetter, false, 'memory keeps lower-is-better scoring');
const quizGame = GAMES.find((g) => g.id === 'quiz');
assert.equal(quizGame?.title, 'Квизик', 'catalog exposes the full Quizzzz product');
assert.equal(quizGame?.modulePath, '/quiz/', 'Quizzzz is mounted as a top-level module');
assert.equal(quizGame?.cfg?.daily, undefined, 'Quizzzz Daily stays server-authoritative');
assert.ok(GAMES.every((g) => g.genre !== 'DAILY'), 'game metadata uses Russian genre labels');
assert.ok(GAMES.some((g) => g.cfg?.injectCss?.includes('.mole::before')), 'reaction target is product-owned CSS visual');

const index = read('index.html');
const hub = read('js/main.js');
const hubCss = read('css/hub.css') + '\n' + read('css/polish.css');
const share = read('js/share.js');
const icons = read('assets/icons.svg');

assert.ok(index.includes('МИНИ-АРКАДА MAX'), 'brand kicker is localized');
assert.ok(index.indexOf('progress-strip') < index.indexOf('game-grid'), 'progress is visible before the game library');
assert.ok(index.includes('assets/icons.svg#brand'), 'shell uses the local brand mark');
for (const id of GAMES.map((g) => g.icon)) assert.ok(icons.includes(`id="${id}"`), `sprite contains ${id}`);
assert.ok(icons.includes('id="brand"'), 'sprite contains brand symbol');

assert.ok(hub.includes("from './progress.js'"), 'hub has local progression');
assert.ok(hub.includes("from './engagement.js'") && hub.includes('observeVisit()'), 'privacy-safe engagement is wired into production shell');
assert.ok(hub.includes("track('new_record'") && hub.includes("track('daily_complete'"), 'record and daily retention events');
assert.ok(hub.includes("track('return_visit'") && hub.includes("track('first_visit'"), 'return/first visit events are emitted by the shell');
assert.ok(hub.includes("bridge.haptic('selection')"), 'MAX haptic feedback stays integrated');
assert.ok(hub.includes('Начни<br>серию'), 'zero streak has a meaningful empty state');
assert.ok(hub.includes('✦ СЕГОДНЯ'), 'daily badge is localized');
assert.ok(hub.includes('result-icon-wrap') && !hub.includes('<div class="result-emoji">'), 'result loop uses local vector identity');
assert.ok(hub.includes('hub_notify_prompted_v1'), 'subscription prompt is rate-limited instead of persistent');

for (const token of ['daily-card', 'game-grid', 'record-pill', 'game-tip', 'confetti']) {
  assert.ok(hubCss.includes(token), `shell keeps ${token} visual layer`);
}
assert.ok(hubCss.includes('@media(max-width:380px)'), '360/375px layouts have an explicit compact treatment');
assert.ok(hubCss.includes('.gbadge{font-size:10px}'), 'functional badge text is no longer sub-10px');
assert.ok(hubCss.includes('.result-icon-wrap'), 'result card has product-owned icon styling');

assert.ok(!share.includes('Segoe UI Emoji') && !share.includes('emoji ||'), 'share card no longer depends on system emoji');
assert.ok(share.includes('drawBrandMark'), 'share card carries the product visual mark');

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
assert.ok(snake.includes('visibilitychange'), 'snake pauses while hidden');
const quizHandoff = read('games/quiz/index.html');
assert.ok(quizHandoff.includes("new URL('/quiz/'"), 'Hub quiz hands off to full Quizzzz');
assert.ok(quizHandoff.includes('topWindow.location.replace'), 'Quizzzz escapes the iframe into MAX top window');
assert.ok(!quizHandoff.includes('../_boot.js'), 'legacy local quiz bridge is no longer user-facing');
const sapper = read('games/sapper/script.js');
assert.ok(sapper.includes('aria-pressed') && sapper.includes('opened-count'), 'sapper exposes clear flag mode and progress HUD');
const merge = read('games/merge/script.js');
assert.ok(merge.includes("cell.textContent=v?String(v):''"), 'merge empty cells are visually empty');
assert.ok(merge.includes("Math.random()<.9?2:4"), 'merge spawns standard 2/4 tiles');

// Волна 2: пять новых игр.
const sudoku = read('games/sudoku/script.js');
assert.ok(sudoku.includes('hubFinish') && sudoku.includes('hubScore(sec)'), 'sudoku reports seconds score and finish');
assert.ok(sudoku.includes('LEVEL_CONFIG'), 'sudoku keeps three difficulty levels');
assert.ok(sudoku.includes('countSolutions'), 'sudoku guarantees unique puzzle solutions');
assert.ok(!/checkBox: false/.test(sudoku), 'sudoku validates 2x2 boxes on easy too');
const lights = read('games/lights/script.js');
assert.ok(lights.includes('hubFinish(moves)') && lights.includes('generatePuzzle'), 'lights reports moves and generates solvable boards');
const nonogram = read('games/nonogram/script.js');
assert.ok(nonogram.includes('hubFinish(elapsedSec())'), 'nonogram reports elapsed seconds on win');
assert.ok(nonogram.includes('lastLongPressAt'), 'nonogram guards long-press vs contextmenu double toggle');
assert.ok((nonogram.match(/\/\/ (Heart|Plus|Frame|Arrow|Diamond|Cross|House|Tree|Cat|Anchor|Umbrella|Sailboat|Fish|Castle|Smiley|Star)/g) || []).length >= 16, 'nonogram puzzle bank expanded');
const battleship = read('games/battleship/script.js');
assert.ok(battleship.includes('pickParityCell'), 'battleship keeps AI levels');
assert.ok(battleship.includes('__hubShots++'), 'battleship reports player shots as score');
assert.ok(battleship.includes('occupiedShipId'), 'battleship allows tap-to-remove placed ship');
const brick = read('games/brick/game.js');
assert.ok(brick.includes('hubFinish(score)') && brick.includes('touchMoveHandler'), 'brick reports score/finish and keeps touch controls');
assert.ok(brick.includes('layoutBricks'), 'brick scales brick geometry to canvas width');
assert.ok(brick.includes('canvas.addEventListener("touchstart"'), 'brick listens touch on canvas only');
assert.ok(!brick.includes('document.addEventListener("touchstart"'), 'brick must not swallow global touchstart');
assert.ok(!brick.includes('confirm('), 'brick must not rely on confirm (stubbed by _boot.js)');

console.log('product/playability contract: ok');
