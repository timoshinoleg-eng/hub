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
  assert.ok(['tap', 'swipe', 'watch', 'flip'].includes(g.hint), `${g.id}: visual onboarding gesture`);
  assert.ok(/^[a-z]+$/.test(g.icon || ''), `${g.id}: local SVG icon id`);
  assert.ok(g.cfg?.injectCss?.includes('font-size:10px'), `${g.id}: embedded mobile readability theme`);
}

assert.equal(GAMES.filter((g) => g.cfg?.daily).length, 3, 'arcade daily rotation excludes server-authoritative Quizzzz');
for (const id of ['sapper', 'echo', 'memory']) {
  assert.equal(GAMES.find((g) => g.id === id)?.cfg?.daily, true, `${id}: arcade daily-capable`);
}
const quizGame = GAMES.find((g) => g.id === 'quiz');
assert.equal(quizGame?.title, 'Квизик', 'catalog exposes the full Quizzzz product');
assert.equal(quizGame?.modulePath, '/quiz/', 'Quizzzz is mounted as a top-level same-origin module');
assert.equal(quizGame?.cfg?.daily, undefined, 'Quizzzz daily remains server-authoritative and outside arcade seed rotation');
assert.equal(GAMES.find((g) => g.id === 'memory')?.cfg?.higherIsBetter, false, 'memory keeps lower-is-better scoring');
assert.ok(GAMES.every((g) => g.genre !== 'DAILY'), 'game metadata uses Russian genre labels');

const index = read('index.html');
const hub = read('js/main.js');
const hubCss = read('css/hub.css') + '\n' + read('css/polish.css');
const share = read('js/share.js');
const icons = read('assets/icons.svg');
const uiState = read('js/ui-state.js');
const quizRedirect = read('games/quiz/index.html');
const quizOverride = read('tools/overrides/quiz-index.html');

assert.ok(index.includes('МИНИ-АРКАДА MAX'), 'brand kicker is localized');
assert.ok(index.indexOf('progress-strip') < index.indexOf('game-grid'), 'progress is visible before the game library');
assert.ok(index.includes('assets/icons.svg#brand'), 'shell keeps the local brand mark');
for (const id of GAMES.map((g) => g.icon)) assert.ok(icons.includes(`id=\"${id}\"`), `sprite contains ${id}`);
for (const state of ['idle', 'happy', 'wow', 'challenge', 'fail']) assert.ok(icons.includes(`id=\"mascot-${state}\"`), `sprite contains mascot ${state}`);
for (const id of GAMES.map((g) => g.id)) assert.ok(icons.includes(`id=\"scene-${id}\"`), `sprite contains ${id} card micro-scene`);

assert.ok(hub.includes('progress.js?v=') || hub.includes("from './progress.js'"), 'hub has local progression (versioned)');
assert.ok((hub.includes('engagement.js?v=') || hub.includes("from './engagement.js'")) && hub.includes('observeVisit()'), 'privacy-safe engagement is wired into production shell');
assert.ok(hub.includes('ui-state.js?v=') || hub.includes("from './ui-state.js'"), 'explicit UI state semantics are wired into production shell');
assert.ok(hub.includes("track('new_record'") && hub.includes("track('daily_complete'"), 'record and daily retention events');
assert.ok(hub.includes("track('return_visit'") && hub.includes("track('first_visit'"), 'return/first visit events are emitted by the shell');
assert.ok(hub.includes("bridge.haptic('selection')"), 'MAX haptic feedback stays integrated');
assert.ok(hub.includes('Начни<br>серию'), 'zero streak has a meaningful empty state');
assert.ok(hub.includes('progress-first') && hub.includes('Сыграй первую партию'), 'first launch avoids a dead zero-stat strip');
assert.ok(hub.includes('dailyHeroState') && hub.includes('completedToday'), 'daily hero distinguishes its own completion from any daily streak progress');
assert.ok(hub.includes('daily-mascot') && hub.includes('mascotSvg'), 'daily hero carries the mascot identity');
assert.ok(hub.includes('gscene') && hub.includes('sceneSvg'), 'catalog cards carry seven product-owned micro-scenes');
assert.ok(hub.includes('hintVisual') && hub.includes('hint-visual'), 'first-run onboarding is visual, not text-only');
assert.ok(hub.includes('✦ ЕЖЕДНЕВНО'), 'non-hero daily-capable game is not mislabeled as today');
assert.ok(hub.includes('daily') && hub.includes('catalog'), 'daily hero is not duplicated in the game grid');
assert.ok(hub.includes("style.setProperty") && hub.includes('--active-game'), 'game shell inherits current game accent');
assert.match(hub, /f\.style\.opacity\s*=\s*['\"]1['\"]/, 'iframe reveal waits for embedded config handshake');
assert.ok(hub.includes('pulseScore()') && hub.includes('finish-sweep'), 'shared score and finish feedback is wired into shell');
assert.ok(hub.includes('result-mascot') && hub.includes('mascotState'), 'result loop uses mascot state feedback');
assert.ok(hub.includes('result-icon-wrap') && !hub.includes('<div class=\"result-emoji\">'), 'result loop uses local vector identity');
assert.ok(hub.includes('hub_notify_prompted_v1'), 'subscription prompt is rate-limited instead of persistent');
assert.ok(hub.includes('share-fallback'), 'share fallback has an explicit compact visual state');
assert.ok(hub.includes('recordBadgeText'), 'first-ever record and later record improvements are visually distinct');
assert.ok(hub.includes('challengeResultState'), 'challenge result exposes win/tie/loss state instead of generic copy');
assert.ok(hub.includes('challengeIntroText'), 'challenge intro matches equality semantics');
assert.ok(hub.includes('gameId') && hub.includes('badge'), 'share-card v2 receives game-specific visual state');
assert.ok(hub.includes('CFG.policyUrl'), 'consent UI does not render a dead policy link when policy URL is absent');

// P1: verify cache identity is release-specific for entire module graph
for (const mod of ['bridge.js', 'track.js', 'share.js', 'duel.js', 'daily.js', 'engagement.js', 'progress.js', 'ui-state.js', 'games.js']) {
  assert.ok(hub.includes(`${mod}?v=`), `main.js uses release-specific URL for ${mod}`);
}

for (const token of ['daily-card', 'game-grid', 'record-pill', 'game-tip', 'confetti']) assert.ok(hubCss.includes(token), `shell keeps ${token} visual layer`);
assert.ok(hubCss.includes('@media(max-width:380px)'), '360/375px layouts have an explicit compact treatment');
assert.ok(hubCss.includes('.gbadge{font-size:10px}'), 'functional badge text is no longer sub-10px');
assert.ok(hubCss.includes('.gscene') && hubCss.includes('.daily-mascot'), 'mascot and card micro-scenes are styled');
assert.ok(hubCss.includes('.hint-gesture') && hubCss.includes('@keyframes hintSwipe'), 'visual onboarding gestures are animated');
assert.ok(hubCss.includes('@keyframes scorePopShared') && hubCss.includes('@keyframes finishSweep'), 'shared feedback vocabulary is styled');
assert.ok(hubCss.includes('.result-icon-wrap'), 'result card has product-owned icon styling');
assert.ok(hubCss.includes('--active-game'), 'active game accent is visible in game/result shell');
assert.ok(hubCss.includes('.progress-strip.is-empty') && hubCss.includes('.progress-first'), 'first-launch progress state is styled');
assert.ok(hubCss.includes('.rduel.tie'), 'challenge tie has its own visual state');
assert.ok(hubCss.includes('.share-fallback .rimg'), 'share fallback preview is constrained on mobile');
assert.ok(hubCss.includes('.consent-card'), 'consent is a dedicated visual state');
assert.ok(hubCss.includes('max-height:calc(100dvh'), 'result cards remain scroll-safe on short WebViews');
assert.ok(uiState.includes('dailyHeroState') && uiState.includes('challengeResultState'), 'UI state module contains daily and challenge semantics');
assert.ok(uiState.includes('ПЕРВЫЙ РЕКОРД') && uiState.includes('НОВЫЙ РЕКОРД'), 'record state copy is explicit');
assert.ok(!share.includes('Segoe UI Emoji') && !share.includes('emoji ||'), 'share card no longer depends on system emoji');
assert.ok(share.includes('drawBrandMark') && share.includes('drawMascot'), 'share card carries product identity');
assert.ok(share.includes('drawGameScene') && share.includes('gameId') && share.includes('badge'), 'share card v2 is game-specific and state-aware');

assert.ok(quizRedirect.includes("new URL('/quiz/'"), 'legacy Hub quiz hands off to same-origin Quizzzz mount');
assert.ok(quizRedirect.includes('topWindow.location.replace'), 'Quizzzz handoff escapes the game iframe to the top-level MAX WebView');
assert.ok(!quizRedirect.includes('../_boot.js'), 'legacy local quiz bridge is no longer part of the user-facing path');
assert.equal(quizOverride, quizRedirect, 'vendor override preserves the Quizzzz module handoff');

const reaction = read('games/reaction/script.js');
const reactionHtml = read('games/reaction/index.html');
const reactionCss = read('games/reaction/style.css');
assert.ok(reaction.includes('DURATION=30000') && reaction.includes('combo') && reaction.includes('function pace()'), 'reaction keeps timer/combo/adaptive pace');
assert.ok(reactionHtml.includes('spark-target') && !reactionHtml.includes('🎯'), 'reaction uses the Spark character instead of system target emoji');
assert.ok(reaction.includes("fx.className='hit-fx'") && reaction.includes("ring.className='miss-ring'"), 'reaction has hit particles and miss ripple');
assert.ok(reactionCss.includes('.spark-target') && reactionCss.includes('data-mood="hot"'), 'reaction character has combo-dependent visual states');

const echo = read('games/echo/script.js');
assert.ok(echo.includes('completed=Math.max(0,level-1)') && echo.includes('__hubDone=false'), 'echo scores completed levels and is restart-safe');
assert.ok(echo.includes('__hubSeed') && echo.includes('__hubResetRand') && echo.includes('__hubRand'), 'echo daily sequence is seeded');
assert.equal((read('games/echo/index.html').match(/id=\"status\"/g) || []).length, 0, 'echo has no duplicate legacy status id');

const memory = read('games/memory/script.js');
assert.ok(memory.includes('function shuffle(a)') && memory.includes("board.innerHTML=''"), 'memory has clean Fisher-Yates restartable board');
assert.ok(memory.includes('__hubSeed') && memory.includes('__hubResetRand') && memory.includes('__hubRand'), 'memory daily layout is seeded');
assert.ok(!read('games/memory/index.html').includes('<li class=\"card\">'), 'memory no longer ships giant static card markup');

const snake = read('games/snake/script.js');
const snakeCss = read('games/snake/style.css');
assert.ok(snake.includes('while(occupied(x,y))'), 'snake food cannot spawn inside snake');
assert.ok(!snake.includes('hub-again') && !snake.includes('location.reload'), 'snake uses hub result loop only');
assert.ok(snake.includes('visibilitychange'), 'snake pauses while hidden');
assert.ok(snake.includes('snake-head') && snake.includes('data-dir'), 'snake has product-owned directional character head');
assert.ok(snakeCss.includes('.snake-head::before') && snakeCss.includes('.food::after'), 'snake has eyes and food character detail');

const sapper = read('games/sapper/script.js');
const sapperCss = read('games/sapper/style.css');
assert.ok(sapper.includes('aria-pressed') && sapper.includes('opened-count'), 'sapper exposes clear flag mode and progress HUD');
assert.ok(sapperCss.includes('@keyframes tileReveal') && sapperCss.includes('@keyframes flagPop'), 'sapper has reveal and flag feedback');

const merge = read('games/merge/script.js');
assert.ok(merge.includes("cell.textContent=v?String(v):''"), 'merge empty cells are visually empty');
assert.ok(merge.includes("Math.random()<.9?2:4"), 'merge spawns standard 2/4 tiles');

console.log('product/playability contract v5: ok');
