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
  assert.ok(/^[a-z]+$/.test(g.icon || ''), `${g.id}: local SVG icon id`);
  assert.ok(g.cfg?.injectCss?.includes('font-size:10px'), `${g.id}: embedded mobile readability theme`);
}
assert.ok(GAMES.filter((g) => g.cfg?.daily).length >= 2, 'at least two daily-capable games');
assert.equal(GAMES.find((g) => g.id === 'memory')?.cfg?.higherIsBetter, false, 'memory keeps lower-is-better scoring');
assert.equal(GAMES.find((g) => g.id === 'quiz')?.tagline, '10 вопросов на эрудицию', 'quiz card matches ten-question runtime');
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
assert.ok(hub.includes('✦ ЕЖЕДНЕВНО'), 'non-hero daily-capable game is not mislabeled as today');
assert.ok(hub.includes('const catalog = all.filter((g) => g.id !== daily?.id)'), 'daily hero is not duplicated in the game grid');
assert.ok(hub.includes("style.setProperty('--active-game'"), 'game shell inherits current game accent');
assert.ok(hub.includes("f.style.opacity = '1'"), 'iframe reveal waits for embedded config handshake');
assert.ok(hub.includes('result-icon-wrap') && !hub.includes('<div class="result-emoji">'), 'result loop uses local vector identity');
assert.ok(hub.includes('hub_notify_prompted_v1'), 'subscription prompt is rate-limited instead of persistent');

for (const token of ['daily-card', 'game-grid', 'record-pill', 'game-tip', 'confetti']) {
  assert.ok(hubCss.includes(token), `shell keeps ${token} visual layer`);
}
assert.ok(hubCss.includes('@media(max-width:380px)'), '360/375px layouts have an explicit compact treatment');
assert.ok(hubCss.includes('.gbadge{font-size:10px}'), 'functional badge text is no longer sub-10px');
assert.ok(hubCss.includes('.result-icon-wrap'), 'result card has product-owned icon styling');
assert.ok(hubCss.includes('--active-game'), 'active game accent is visible in game/result shell');

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
const snakeCss = read('games/snake/style.css');
assert.ok(snake.includes('while(occupied(x,y))'), 'snake food cannot spawn inside snake');
assert.ok(!snake.includes('hub-again') && !snake.includes('location.reload'), 'snake uses hub result loop only');
assert.ok(snake.includes('visibilitychange'), 'snake pauses while hidden');
assert.ok(snake.includes('snake-head') && snake.includes('data-dir'), 'snake has product-owned directional character head');
assert.ok(snakeCss.includes('.snake-head::before') && snakeCss.includes('.food::after'), 'snake has eyes and food character detail');
const quiz = read('games/quiz/script.js');
const quizCss = read('games/quiz/style.css');
assert.ok(quiz.includes('questionBank.slice(0,10)'), 'daily quiz is intentionally ten questions');
assert.ok(quiz.includes("button.classList.add('correct')") && quiz.includes("button.classList.add('wrong')"), 'quiz has immediate answer feedback');
assert.ok(!read('games/quiz/index.html').includes('id="submit"'), 'quiz has no submit-button friction');
assert.ok(quizCss.includes('counter-reset:answer') && quizCss.includes('.option::before'), 'quiz answer cards have game-like A/B/C/D chips');
const sapper = read('games/sapper/script.js');
const sapperCss = read('games/sapper/style.css');
assert.ok(sapper.includes('aria-pressed') && sapper.includes('opened-count'), 'sapper exposes clear flag mode and progress HUD');
assert.ok(sapperCss.includes('@keyframes tileReveal') && sapperCss.includes('@keyframes flagPop'), 'sapper has reveal and flag feedback');
const merge = read('games/merge/script.js');
assert.ok(merge.includes("cell.textContent=v?String(v):''"), 'merge empty cells are visually empty');
assert.ok(merge.includes("Math.random()<.9?2:4"), 'merge spawns standard 2/4 tiles');

console.log('product/playability contract: ok');
