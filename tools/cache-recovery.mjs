#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeConfig = readFileSync(join(root, 'runtime-config.js'), 'utf8');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const main = readFileSync(join(root, 'js', 'main.js'), 'utf8');

function executeRuntimeConfig(dynamicBoot) {
  const appended = [];
  const sandbox = {
    encodeURIComponent,
    document: {
      createElement: (tag) => ({ tag }),
      head: { appendChild: (node) => appended.push(node) },
    },
    window: dynamicBoot ? { __HUB_DYNAMIC_BOOT__: true } : {},
  };
  vm.createContext(sandbox);
  vm.runInContext(runtimeConfig, sandbox, { filename: 'runtime-config.js' });
  return { appended, window: sandbox.window };
}

const legacyShell = executeRuntimeConfig(false);
assert.equal(legacyShell.appended.length, 1, 'uncached runtime config upgrades a legacy cached shell');
assert.equal(legacyShell.appended[0].type, 'module', 'legacy recovery loads the Hub as an ES module');
assert.match(legacyShell.appended[0].src, /^js\/bootstrap\.js\?v=.+/, 'legacy recovery uses a versioned main module URL');
assert.ok(legacyShell.window.HUB_ASSET_REVISION, 'runtime config exposes the active asset revision');

const currentShell = executeRuntimeConfig(true);
assert.equal(currentShell.appended.length, 0, 'current shell owns a single module boot');
assert.match(index, /window\.__HUB_DYNAMIC_BOOT__\s*=\s*true/, 'current shell identifies its versioned boot path');
assert.match(index, /js\/bootstrap\.js\?v=/, 'current shell loads a versioned bootstrap module URL');
assert.doesNotMatch(index, /<script type="module" src="js\/main\.js"><\/script>/, 'unversioned static main boot is removed');
assert.match(main, /from '\.\/bridge\.js\?v=/, 'recovery main module requests an uncached bridge');
assert.match(main, /document\.readyState === 'loading'/, 'recovery main module initializes after a late dynamic load');

console.log('MAX cached-shell recovery contract: ok');
