#!/usr/bin/env node
/**
 * Регресс-контракт воспроизводимости vendor-пайплайна.
 *
 * Исходный дефект: tools/vendor-overrides.mjs копировал 20 файлов из
 * tools/overrides/ в games/, а tools/check.mjs сверял байты только для 12 пар.
 * Восемь файлов (reaction/script, sapper/index+script+style, echo/index,
 * memory/script, snake/script, echo/index) не проверялись, поэтому
 * `npm run vendor` молча подменял их непроверенными копиями, а `npm run check`
 * оставался зелёным. Для 8 файлов это означало одно: рабочая и протестированная
 * версия игры в проде расходилась с тем, что вернёт vendor.
 *
 * Контракт проверяет, что реестр единственный и полный, что канонические копии
 * существуют, что все пары совпадают байт в байт и что неиспользуемых
 * канонических файлов не осталось.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OVERRIDE_PAIRS } from './overrides.manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OVERRIDES_DIR = join(ROOT, 'tools', 'overrides');

assert.ok(OVERRIDE_PAIRS.length >= 20, `реестр покрывает все перезаписываемые файлы (сейчас ${OVERRIDE_PAIRS.length})`);

// Реестр не должен содержать дублей: иначе один файл копировался бы дважды.
const fileNames = OVERRIDE_PAIRS.map(([file]) => file);
assert.equal(new Set(fileNames).size, fileNames.length, 'в реестре нет повторяющихся имён override-файлов');

const destNames = OVERRIDE_PAIRS.map(([, dest]) => dest);
assert.equal(new Set(destNames).size, destNames.length, 'в реестре нет повторяющихся назначений в games/');

// Каждая пара обязана реально совпадать: это и есть воспроизводимость.
for (const [file, dest] of OVERRIDE_PAIRS) {
  const canonical = join(OVERRIDES_DIR, file);
  const target = join(ROOT, dest);
  const a = readFileSync(canonical, 'utf8');
  const b = readFileSync(target, 'utf8');
  assert.equal(b, a, `${dest}: расходится с канонической копией ${file}`);
}

// Канонические файлы, не попавшие в реестр, — мёртвый груз: их никто не
// применяет и никто не проверяет, но они лежат в репозитории и вводят в
// заблуждение при чтении vendor-пайплайна.
const onDisk = readdirSync(OVERRIDES_DIR).filter((f) => f !== 'manifest.mjs');
const registered = new Set(fileNames);
const orphans = onDisk.filter((f) => !registered.has(f));
assert.deepEqual(orphans, [], `в tools/overrides/ есть файлы вне реестра: ${orphans.join(', ')}`);

// Каждая из перезаписываемых игр покрыта хотя бы одним override-файлом,
// иначе vendor вернёт к ней апстрим-версию без наших адаптаций.
const covered = new Set(destNames.map((d) => d.split('/')[1]));
for (const game of ['merge', 'quiz', 'reaction', 'snake', 'sapper', 'echo', 'memory']) {
  assert.ok(covered.has(game), `игра ${game} покрыта vendor overrides`);
}

console.log('vendor reproducibility contract: ok');
console.log(`  ${OVERRIDE_PAIRS.length} пар байт в байт, orphaned overrides: 0`);
console.log(`  покрыты игры: ${[...covered].sort().join(', ')}`);
