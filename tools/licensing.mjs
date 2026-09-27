#!/usr/bin/env node
/**
 * Контракт лицензирования.
 *
 * До этого в репозитории не было ни LICENSE, ни NOTICE, при том что в games/
 * лежит около 120 КБ стороннего MIT-кода. Для публичного репозитория и
 * коммерческого Mini App это реальный риск: непонятно, под какой лицензией
 * сам хаб, и нет обязательных уведомлений об авторском праве.
 *
 * Контракт проверяет, что оба файла существуют, что NOTICE перечисляет каждого
 * донора вместе с ревизией, и что граница «свой код / чужой код» в LICENSE
 * согласована с фактическим содержимым games/.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../js/games.js';
import { UPSTREAM_SOURCES, VENDORED_GAMES, MANUAL_GAMES } from './upstream-pins.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const license = read('LICENSE');
const notice = read('NOTICE');
const thirdParty = read('THIRD-PARTY.md');

assert.ok(license.includes('MIT License'), 'LICENSE содержит текст MIT');
assert.ok(license.includes('Copyright (c) 2026'), 'LICENSE содержит собственный copyright');

// LICENSE обязан явно отделить свой код от чужого, иначе утверждение
// «весь репозиторий под MIT» противоречит наличию производных игр.
assert.match(license, /ТОЛЬКО код, написанный для этого репозитория/, 'LICENSE ограничивает свою лицензию своим кодом');
assert.match(license, /licenses\/he-is-talha-MIT\.txt/, 'LICENSE ссылается на текст лицензии первого донора');
assert.match(license, /licenses\/html-brick-game-MIT\.txt/, 'LICENSE ссылается на текст лицензии второго донора');

// NOTICE — стандартное место для обязательных уведомлений, и он должен быть
// полным: каждый донор, его ревизия, лицензия и полный путь к тексту.
for (const [name, pin] of Object.entries(UPSTREAM_SOURCES)) {
  assert.ok(notice.includes(name), `NOTICE упоминает донора ${name}`);
  assert.ok(notice.includes(pin.sha), `NOTICE фиксирует ревизию ${pin.sha} для ${name}`);
  assert.ok(notice.includes(pin.licenseFile), `NOTICE ссылается на ${pin.licenseFile}`);
  assert.ok(readFileSync(join(ROOT, pin.licenseFile), 'utf8').includes('MIT License'),
    `${pin.licenseFile} содержит полный текст MIT с copyright notice`);
}

// Время выполнения тоже имеет лицензии, и они должны быть перечислены.
for (const dep of ['@maxhub/max-bot-api', 'fastify', 'pg']) {
  assert.ok(notice.includes(dep), `NOTICE упоминает зависимость ${dep}`);
}

// Каждая vendored-игра должна быть перечислена в NOTICE, чтобы уведомление
// об авторском праве относилось к конкретным каталогам, а не «к репозиторию».
for (const id of Object.keys(VENDORED_GAMES)) {
  assert.ok(notice.includes(id), `NOTICE перечисляет игру ${id}`);
}
for (const id of Object.keys(MANUAL_GAMES)) {
  assert.ok(notice.includes(id), `NOTICE перечисляет ручную игру ${id}`);
}

// Архивированный донор обязан быть помечен в NOTICE явно: иначе через год
// никто не вспомнит, что brick нельзя сверить с апстримом.
assert.match(notice, /архивирован/i, 'NOTICE отмечает архивированный донор как риск');

// Фактическая структура games/ обязана совпадать с заявленной: никакой игры
// не появилось и не исчезло «молча», вне заявленных лицензий.
const onDisk = readdirSync(join(ROOT, 'games'))
  .filter((f) => statSync(join(ROOT, 'games', f)).isDirectory())
  .sort();
const declared = GAMES.map((g) => g.id).sort();
assert.deepEqual(onDisk, declared, 'каталог games/ совпадает с манифестом и заявленными лицензиями');

// quiz — handoff, а не производная игра: логики в этом репозитории нет.
assert.match(license, /Quizzzz/, 'LICENSE отмечает, что логика Квизик живёт в отдельном продукте');

// Товарные знаки: лицензия на код не покрывает бренды — это должно быть сказано.
assert.match(notice, /товарн/i, 'NOTICE оговаривает сторонние товарные знаки');
assert.match(thirdParty, /товарн/i, 'THIRD-PARTY.md оговаривает сторонние бренды');

console.log('licensing contract: ok');
console.log(`  LICENSE: MIT, собственный код отделён от ${Object.keys(UPSTREAM_SOURCES).length} доноров`);
console.log(`  NOTICE: ревизии, лицензии, полные тексты, пометка архивированного донора`);
console.log(`  games/ (${onDisk.length} каталогов) полностью покрыт заявленными лицензиями`);
