#!/usr/bin/env node
import { dailySeed } from '../js/daily.js';
let fails = 0;
function ok(cond, msg) { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; }

ok(dailySeed(new Date('2026-09-08T20:59:59Z')) === '2026-09-08', 'до полуночи Москвы остаётся предыдущий daily');
ok(dailySeed(new Date('2026-09-08T21:00:00Z')) === '2026-09-09', 'ровно в полночь Москвы daily переключается');
ok(dailySeed(new Date('2026-01-01T00:00:00Z')) === '2026-01-01', 'формат стабилен YYYY-MM-DD');

if (fails) process.exit(1);
console.log('\nDaily boundary зафиксирован на Europe/Moscow.');
