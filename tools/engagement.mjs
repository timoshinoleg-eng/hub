#!/usr/bin/env node
import assert from 'node:assert/strict';
import { observeVisit } from '../js/engagement.js';

const store = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)),
} });

let r = observeVisit('2026-09-08');
assert.deepEqual(r, { firstVisit: true, returning: false, daysAway: null });
assert.equal(store.size, 1, 'хранится только visit state');
assert.ok(!JSON.stringify([...store]).match(/user|init|uuid|fingerprint/i), 'visit state не содержит identity');

r = observeVisit('2026-09-08');
assert.deepEqual(r, { firstVisit: false, returning: false, daysAway: null }, 'reload в тот же день не retention');

r = observeVisit('2026-09-09');
assert.deepEqual(r, { firstVisit: false, returning: true, daysAway: 1 }, 'возврат на следующий день фиксируется как gap=1');

r = observeVisit('2026-09-12');
assert.deepEqual(r, { firstVisit: false, returning: true, daysAway: 3 }, 'многодневный gap считается корректно');

r = observeVisit('bad-date');
assert.deepEqual(r, { firstVisit: false, returning: false, daysAway: null }, 'невалидная дата не создаёт retention signal');

console.log('privacy-safe engagement contract: ok');
