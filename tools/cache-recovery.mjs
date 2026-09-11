#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeConfig = readFileSync(join(root, 'runtime-config.js'), 'utf8');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const bootstrap = readFileSync(join(root, 'js', 'bootstrap.js'), 'utf8');
const launchRouter = readFileSync(join(root, 'js', 'launch-router.js'), 'utf8');
const main = readFileSync(join(root, 'js', 'main.js'), 'utf8');
const engagement = readFileSync(join(root, 'js', 'engagement.js'), 'utf8');
const track = readFileSync(join(root, 'js', 'track.js'), 'utf8');

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

// Legacy shell recovery
const legacyShell = executeRuntimeConfig(false);
assert.equal(legacyShell.appended.length, 1, 'uncached runtime config upgrades a legacy cached shell');
assert.equal(legacyShell.appended[0].type, 'module', 'legacy recovery loads an ES module');
assert.match(legacyShell.appended[0].src, /^js\/bootstrap\.js\?v=.+/, 'legacy recovery preserves Quizzzz-aware versioned bootstrap');
assert.ok(legacyShell.window.HUB_ASSET_REVISION, 'runtime config exposes the active asset revision');

const currentShell = executeRuntimeConfig(true);
assert.equal(currentShell.appended.length, 0, 'current shell owns a single module boot');
assert.match(index, /window\.__HUB_DYNAMIC_BOOT__\s*=\s*true/, 'current shell identifies its dynamic boot path');
assert.match(index, /js\/bootstrap\.js\?v=/, 'current shell loads a versioned Quizzzz-aware bootstrap');
assert.match(bootstrap, /launch-router\.js\?v=/, 'bootstrap revalidates launch routing');
assert.match(bootstrap, /main\.js\?v=/, 'bootstrap revalidates the Hub application module');

// P1: bootstrap must route Quizzzz before Hub
assert.ok(bootstrap.includes('routeQuizzzzLaunch'), 'bootstrap executes Quizzzz compatibility router');
assert.ok(bootstrap.indexOf('routeQuizzzzLaunch') < bootstrap.indexOf('main.js'), 'launch-router runs before Hub main');

// P1: launch-router versioned bridge
assert.match(launchRouter, /bridge\.js\?v=/, 'launch-router revalidates bridge with release revision');

// P1: main.js must version entire module graph
const requiredModules = [
  'bridge.js',
  'track.js',
  'share.js',
  'duel.js',
  'daily.js',
  'engagement.js',
  'progress.js',
  'ui-state.js',
  'games.js',
];
for (const mod of requiredModules) {
  const pattern = new RegExp(`${mod.replace('.', '\\.')}\\?v=`);
  assert.match(main, pattern, `main.js uses release-specific URL for ${mod}`);
}
// Ensure no unversioned static imports remain for local modules
const unversionedLocalImport = /from\s+['"]\.\/(bridge|track|share|duel|daily|engagement|progress|ui-state|games)\.js['"]/g;
assert.equal(unversionedLocalImport.test(main), false, 'main.js has no unversioned local imports');

// P1: nested dependencies versioned
assert.match(engagement, /daily\.js\?v=/, 'engagement.js revalidates daily.js with release revision');
assert.doesNotMatch(engagement, /from\s+['"]\.\/daily\.js['"]/, 'engagement.js has no unversioned daily import');

// P1: all js modules that have imports must be versioned - check known list
const jsFiles = {
  'bridge.js': readFileSync(join(root, 'js', 'bridge.js'), 'utf8'),
  'daily.js': readFileSync(join(root, 'js', 'daily.js'), 'utf8'),
  'duel.js': readFileSync(join(root, 'js', 'duel.js'), 'utf8'),
  'progress.js': readFileSync(join(root, 'js', 'progress.js'), 'utf8'),
  'share.js': readFileSync(join(root, 'js', 'share.js'), 'utf8'),
  'track.js': track,
  'ui-state.js': readFileSync(join(root, 'js', 'ui-state.js'), 'utf8'),
  'games.js': readFileSync(join(root, 'js', 'games.js'), 'utf8'),
};
for (const [name, content] of Object.entries(jsFiles)) {
  // If file imports local modules, it must use versioned URL
  const localImports = [...content.matchAll(/from\s+['"]\.\/([a-z-]+\.js)['"]/g)];
  for (const m of localImports) {
    assert.fail(`${name} has unversioned import ${m[0]} - must use ?v= revision`);
  }
}

// Regression scenario: old track.js missing subscriptionAvailable, new main.js requires it
// Simulate old track.js
const oldTrack = `
export const track = () => {};
export const hasConsent = () => false;
export const setConsent = () => {};
export const subscribe = async () => ({ok:false});
`;
// old track has no subscriptionAvailable
assert.doesNotMatch(oldTrack, /subscriptionAvailable/, 'old track.js lacks subscriptionAvailable (regression precondition)');
// new main.js must import subscriptionAvailable with versioned URL, so upgrade will fetch new track.js
assert.match(main, /subscriptionAvailable/, 'new main.js requires subscriptionAvailable');
assert.match(main, /track\.js\?v=/, 'new main.js fetches track.js with release-specific identity, avoiding stale old track.js');

// Ensure current shell does not launch Hub twice (already checked appended length)
assert.equal(currentShell.appended.length, 0, 'current shell does not double-boot Hub');

// Quizzzz routing not regressed - check launch-router still handles legacy intents
assert.match(launchRouter, /QUIZZZZ_EXACT|isQuizzzzStartParam/, 'launch-router preserves Quizzzz intent detection');
assert.match(launchRouter, /d_/, 'launch-router preserves d_ token routing');

// Arcade g<game> routing remains Hub-owned - check main.js still has parseStartParam for g<game>
assert.match(main, /parseStartParam/, 'main.js preserves arcade g<game> deep-link parsing');
assert.match(main, /g\(\[a-z\]\+\)/, 'arcade routing pattern remains');

console.log('MAX cached-shell + Quizzzz routing recovery contract: ok');
console.log('P1 nested module cache identity contract: ok');
console.log('Regression scenario old track.js missing subscriptionAvailable -> new main.js with versioned track.js: ok');
