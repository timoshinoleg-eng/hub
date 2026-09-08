#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  challengeIntroText,
  challengeResultState,
  dailyHeroState,
  dailyResultText,
  recordBadgeText,
} from '../js/ui-state.js';

const today = '2026-09-09';
const playedInMoscowToday = Date.parse('2026-09-08T21:15:00Z');
const playedYesterday = Date.parse('2026-09-08T18:00:00Z');

assert.deepEqual(
  dailyHeroState({ lastPlayed: playedInMoscowToday }, today, false),
  { completed: true, status: '✓ вызов выполнен', cta: 'Побить результат' },
  'hero recognizes completion in Moscow date boundary',
);
assert.deepEqual(
  dailyHeroState({ lastPlayed: playedYesterday }, today, true),
  { completed: false, status: 'серия уже сохранена', cta: 'Играть сейчас' },
  'another daily may preserve the streak without pretending hero was completed',
);
assert.equal(dailyHeroState({}, today, false).cta, 'Играть сейчас', 'fresh daily has primary play CTA');

assert.equal(recordBadgeText({ newBest: true, plays: 1 }), '✦ ПЕРВЫЙ РЕКОРД', 'first finish is not mislabeled as an improvement');
assert.equal(recordBadgeText({ newBest: true, plays: 2 }), '✦ НОВЫЙ РЕКОРД', 'later personal best is labeled as new record');
assert.equal(recordBadgeText({ newBest: false, plays: 3 }), '', 'ordinary finish has no record badge');

assert.equal(dailyResultText({ dailyAdvanced: true, streak: 1 }), '✦ Серия началась · 1 день');
assert.equal(dailyResultText({ dailyAdvanced: true, streak: 4 }), '✦ Серия продлена · 4 дн.');
assert.equal(dailyResultText({ dailyAdvanced: false, streak: 4 }), '');

assert.deepEqual(
  challengeResultState({ tie: true, won: true, score: 10, challenge: 10 }, true),
  { kind: 'tie', text: 'НИЧЬЯ · цель 10' },
  'tie is visually distinct from win',
);
assert.deepEqual(
  challengeResultState({ tie: false, won: true, score: 12, challenge: 10 }, true),
  { kind: 'win', text: 'ПОБЕДА · цель 10' },
);
assert.deepEqual(
  challengeResultState({ tie: false, won: false, score: 7, challenge: 10 }, true),
  { kind: 'lose', text: 'ДО ЦЕЛИ · +3' },
  'higher-is-better loss exposes exact gap',
);
assert.deepEqual(
  challengeResultState({ tie: false, won: false, score: 14, challenge: 10 }, false),
  { kind: 'lose', text: 'ДО ЦЕЛИ · −4' },
  'lower-is-better loss exposes exact gap',
);
assert.equal(challengeIntroText(25, true, 'очков'), 'Цель челленджа: не меньше 25 очков');
assert.equal(challengeIntroText(12, false, 'ходов'), 'Цель челленджа: не больше 12 ходов');

console.log('ui state contract: ok');
