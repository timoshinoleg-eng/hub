#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeConfig = readFileSync(join(root, 'runtime-config.js'), 'utf8');
const integration = readFileSync(join(root, 'QUIZZZZ_P0_P2_FIX.md'), 'utf8');

// Hub-side mirror of the cross-repository production renderer contract.
// The authoritative executable test now lives in paired Quizzzz PR #14 as
// tests/test_hub_production_renderer_contract.py and exercises the real renderer
// plus the real cutover shell. This mirror keeps Hub's runtime assumptions aligned.
function validateProductionRevision(env, botUsername, hubSha, assetRevision) {
  if (env !== 'production') return { ok: true, reason: 'non-production' };
  if (!botUsername) return { ok: false, reason: 'BOT_USERNAME required' };
  const shaRegex = /^[0-9a-f]{40}$/;
  if (!hubSha || !shaRegex.test(hubSha)) return { ok: false, reason: 'invalid HUB_SHA' };
  if (!assetRevision || !shaRegex.test(assetRevision)) return { ok: false, reason: 'invalid HUB_ASSET_REVISION' };
  if (assetRevision !== hubSha) return { ok: false, reason: 'revision mismatch' };
  return { ok: true, revision: assetRevision };
}

const validSha = 'a'.repeat(40);
assert.deepEqual(
  validateProductionRevision('production', 'quizik_bot', validSha, validSha),
  { ok: true, revision: validSha },
  'exact production Hub SHA is accepted'
);
assert.equal(validateProductionRevision('production', 'quizik_bot', validSha, undefined).ok, false, 'missing revision fails');
assert.equal(validateProductionRevision('production', 'quizik_bot', validSha, 'dev-unpinned').ok, false, 'dev-unpinned fails');
assert.equal(validateProductionRevision('production', 'quizik_bot', validSha, 'A'.repeat(40)).ok, false, 'uppercase/malformed revision fails');
assert.equal(validateProductionRevision('production', 'quizik_bot', validSha, 'b'.repeat(40)).ok, false, 'revision mismatch fails');
assert.equal(validateProductionRevision('production', '', validSha, validSha).ok, false, 'missing bot username fails');

assert.ok(runtimeConfig.includes('HUB_ASSET_REVISION'), 'Hub runtime config exposes the asset revision');
assert.match(runtimeConfig, /js\/bootstrap\.js\?v=/, 'legacy shell recovery consumes the revision');

assert.match(integration, /HUB_ASSET_REVISION="\$HUB_SHA"/, 'paired cutover fix is documented as applied');
assert.match(integration, /tests\/test_hub_production_renderer_contract\.py/, 'authoritative paired executable regression is documented');
assert.doesNotMatch(integration, /must be applied manually/i, 'handoff no longer claims a manual unapplied fix');

console.log('P0 Hub/Quizzzz production renderer contract mirror: ok');
console.log('Authoritative real renderer + cutover regression: paired Quizzzz test_hub_production_renderer_contract.py');
