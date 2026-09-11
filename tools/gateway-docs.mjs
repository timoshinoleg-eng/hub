#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const integration = readFileSync(join(root, 'QUIZZZZ_INTEGRATION.md'), 'utf8');

assert.ok(integration.includes('FastAPI docs surface decision'), 'docs surface decision is documented');
assert.ok(
  integration.includes('/docs') && integration.includes('/redoc') && integration.includes('/openapi.json'),
  'docs endpoints are explicitly listed'
);
assert.match(integration, /minimal surface/i, 'decision prefers minimal public surface');
assert.match(integration, /internal\/non-public/i, 'docs are explicitly non-public');
assert.match(integration, /returns HTTP 404/i, 'unified public gateway explicitly returns 404 for docs');
assert.match(integration, /tests\/test_gateway_docs_contract\.py/, 'paired Quizzzz executable contract is referenced');
assert.doesNotMatch(
  integration,
  /must be instantiated with `?docs_url=None/i,
  'Hub contract must not claim FastAPI itself is disabled when the gateway is the enforcement point'
);

console.log('FastAPI docs surface explicit decision contract: ok');
console.log('  Unified public gateway: /docs, /redoc, /openapi.json -> 404');
console.log('  Internal FastAPI docs may remain available inside the private service');
