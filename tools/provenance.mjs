#!/usr/bin/env node
/**
 * Контракт происхождения игрового кода.
 *
 * Проверяет, что у каждой игры в каталоге есть прослеживаемый донор с
 * зафиксированной ревизией, что зафиксированные ревизии совпадают с
 * заявленными в THIRD-PARTY.md, и что состояние апстрима отражено честно.
 *
 * Зачем. До этого vendor-пайплайн требовал только наличия папки исходников и
 * всегда тянул актуальный HEAD, а brick был внесён вручную из
 * ChanMeng666/html-brick-game — репозитория с 2 звёздами, который
 * **архивирован** (последний push 2026-06-17). То есть донор для 33 КБ
 * production-игры был мёртв, и сверить адаптацию с апстримом было нечем.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../js/games.js';
import { UPSTREAM_SOURCES, VENDORED_GAMES, MANUAL_GAMES } from './upstream-pins.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const thirdParty = read('THIRD-PARTY.md');
const readme = read('README.md');

// Каждая ревизия зафиксирована и выглядит как git SHA.
for (const [name, pin] of Object.entries(UPSTREAM_SOURCES)) {
  assert.match(pin.sha, /^[0-9a-f]{7,40}$/, `${name}: ревизия зафиксирована как git SHA`);
  assert.ok(pin.url.startsWith('https://github.com/'), `${name}: указан публичный URL`);
  assert.ok(pin.license, `${name}: указана лицензия`);
  assert.ok(readFileSync(join(ROOT, pin.licenseFile), 'utf8').includes('MIT License'),
    `${name}: текст лицензии реально лежит в ${pin.licenseFile}`);
  // Ревизия обязана быть упомянута в THIRD-PARTY.md, иначе зафиксированный
  // SHA существует только в коде и не виден при ревью происхождения.
  assert.ok(thirdParty.includes(pin.sha), `${name}: ревизия ${pin.sha} зафиксирована в THIRD-PARTY.md`);
}

// Каждая игра каталога покрыта либо vendor-пайплайном, либо ручным списком.
const catalog = GAMES.map((g) => g.id);
const covered = new Set([...Object.keys(VENDORED_GAMES), ...Object.keys(MANUAL_GAMES)]);
for (const id of catalog) {
  assert.ok(covered.has(id), `${id}: игра покрыта vendor-пайплайном или ручным списком донора`);
}
for (const id of covered) {
  assert.ok(catalog.includes(id), `${id}: донор существует, но игры нет в каталоге — удалите устаревшую запись`);
}

// brick — единственная игра из заброшенного донора. Это осознанное решение, а
// не упущение, поэтому оно обязано быть отражено и в коде, и в документации.
const brick = MANUAL_GAMES.brick;
assert.equal(brick.source, 'ChanMeng666/html-brick-game', 'brick происходит из отдельного донора');
assert.match(brick.reason, /архивирован/, 'причина ручного внесения объясняет состояние апстрима');
const brickPin = UPSTREAM_SOURCES[brick.source];
assert.equal(brickPin.archived, true, 'состояние донора brick зафиксировано как архивированное');

// Винтинговый пакет жив и обновляется — значит обновление донора возможно, и
// это стоит сказать явно, чтобы не ошибочно считать все игры «замороженными».
const pack = UPSTREAM_SOURCES['he-is-talha/html-css-javascript-games'];
assert.equal(pack.archived, false, 'основной пакет донора активен, ревизию можно обновлять осознанно');

// README обязан объяснять процедуру обновления зафиксированной ревизии.
assert.match(readme, /закреплённ/i, 'README описывает работу с зафиксированными ревизиями');
assert.match(readme, /upstream/i, 'README упоминает обновление апстрима как отдельное решение');

console.log('game provenance contract: ok');
console.log(`  доноров: ${Object.keys(UPSTREAM_SOURCES).length}, ревизий зафиксировано: ${Object.values(UPSTREAM_SOURCES).map((p) => p.sha).join(', ')}`);
console.log(`  vendor-игр: ${Object.keys(VENDORED_GAMES).length}, внесено вручную: ${Object.keys(MANUAL_GAMES).join(', ')}`);
console.log('  brick: донор архивирован — адаптация ведётся вручную, это зафиксировано');
