#!/usr/bin/env node
import assert from 'node:assert/strict';
import { isBetterScore, nextDailyStreak } from '../js/progress.js';
assert.equal(isBetterScore(10,null,true),true);
assert.equal(isBetterScore(10,9,true),true);
assert.equal(isBetterScore(8,9,true),false);
assert.equal(isBetterScore(7,8,false),true);
assert.equal(isBetterScore(9,8,false),false);
assert.equal(nextDailyStreak('2026-09-07',4,'2026-09-08'),5);
assert.equal(nextDailyStreak('2026-09-08',5,'2026-09-08'),5);
assert.equal(nextDailyStreak('2026-09-05',5,'2026-09-08'),1);
console.log('progress contract: ok');
