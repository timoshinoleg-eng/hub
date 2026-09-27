#!/usr/bin/env node
/** Stable production adaptations applied after upstream vendor.mjs. */
import { copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OVERRIDE_PAIRS } from './overrides.manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Fail loudly rather than half-applying: a missing canonical copy would leave
// games/ in a mixed state that npm run check cannot explain.
const missing = OVERRIDE_PAIRS
  .map(([file, dest]) => [file, dest, join(ROOT, 'tools', 'overrides', file)])
  .filter(([, , src]) => !existsSync(src));
if (missing.length) {
  console.error('Отсутствуют канонические override-файлы:');
  for (const [file, dest, src] of missing) console.error(`  ${file} -> ${dest} (${src})`);
  console.error('\nСкопируйте проверенные файлы из games/ в tools/overrides/ и закоммитьте их.');
  process.exit(1);
}

for (const [file, dest] of OVERRIDE_PAIRS) {
  copyFileSync(join(ROOT, 'tools', 'overrides', file), join(ROOT, dest));
}
console.log(`Stable production vendor overrides применены (${OVERRIDE_PAIRS.length} файлов).`);
