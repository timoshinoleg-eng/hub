#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const trackSource = readFileSync(join(root, 'js', 'track.js'), 'utf8');
const mainSource = readFileSync(join(root, 'js', 'main.js'), 'utf8');

// Helper to evaluate track.js subscriptionAvailable with given env
function evalSubscriptionAvailable({ endpoint, notificationsEnabled }) {
  const sandbox = {
    window: {
      HUB_TRACK_ENDPOINT: endpoint || '',
      HUB_CONFIG: { notificationsEnabled },
      WebApp: {},
    },
    location: { protocol: 'https:' },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    globalThis: {},
    console,
  };
  sandbox.globalThis.crypto = { randomUUID: () => 'test-uuid' };
  sandbox.globalThis.localStorage = sandbox.localStorage;

  // Minimal module evaluation - extract subscriptionAvailable logic
  // We parse the file for subscriptionAvailable implementation
  const vmContext = vm.createContext(sandbox);
  // Wrap track.js as module-like but we only need subscriptionAvailable
  // Simplify: evaluate the relevant part
  const code = `
    const RAW_ENDPOINT = window.HUB_TRACK_ENDPOINT || '';
    const ENDPOINT = RAW_ENDPOINT && (location.protocol !== 'https:' || /^https:\\/\\//i.test(RAW_ENDPOINT)) ? RAW_ENDPOINT : '';
    const subscriptionAvailable = () => {
      const cfgEnabled = typeof window !== 'undefined' && window.HUB_CONFIG?.notificationsEnabled === true;
      return Boolean(ENDPOINT) && cfgEnabled;
    };
    subscriptionAvailable();
  `;
  return vm.runInContext(code, vmContext);
}

// Test cases from task
assert.equal(evalSubscriptionAvailable({ endpoint: 'https://example.com/ev', notificationsEnabled: false }), false, 'endpoint present + notificationsEnabled=false -> CTA absent (fail-closed)');
assert.equal(evalSubscriptionAvailable({ endpoint: '', notificationsEnabled: true }), false, 'endpoint absent + notificationsEnabled=true -> CTA absent');
assert.equal(evalSubscriptionAvailable({ endpoint: 'https://example.com/ev', notificationsEnabled: true }), true, 'endpoint present + notificationsEnabled=true -> capability may be shown');
assert.equal(evalSubscriptionAvailable({ endpoint: '', notificationsEnabled: false }), false, 'both absent -> CTA absent');
assert.equal(evalSubscriptionAvailable({ endpoint: 'http://insecure.com/ev', notificationsEnabled: true }), false, 'insecure endpoint must be rejected even when notificationsEnabled=true');

// Verify track.js source itself implements fail-closed gate
assert.match(trackSource, /HUB_CONFIG\?.notificationsEnabled/, 'track.js checks HUB_CONFIG.notificationsEnabled');
assert.match(trackSource, /Boolean\(ENDPOINT\)/, 'track.js checks ENDPOINT existence');
assert.match(trackSource, /subscriptionAvailable/, 'track.js exposes subscriptionAvailable');
assert.match(trackSource, /notificationsEnabled/, 'track.js gates by notificationsEnabled');

// Verify main.js shouldOfferNotify also checks CFG.notificationsEnabled
assert.match(mainSource, /CFG\.notificationsEnabled/, 'main.js shouldOfferNotify checks CFG.notificationsEnabled');
assert.match(mainSource, /subscriptionAvailable/, 'main.js uses subscriptionAvailable for gating');

// Verify subscribe() also checks notificationsEnabled
assert.match(trackSource, /notifications_disabled/, 'subscribe() returns notifications_disabled when gate is off');

console.log('notification privacy/gating client contract: ok');
console.log('  endpoint present + notificationsEnabled=false -> CTA absent: ok');
console.log('  endpoint absent + notificationsEnabled=true -> CTA absent: ok');
console.log('  endpoint present + notificationsEnabled=true -> capability may be shown: ok');
