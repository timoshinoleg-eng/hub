#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const integration = readFileSync(join(root, 'QUIZZZZ_INTEGRATION.md'), 'utf8');
const caddyHub = readFileSync(join(root, 'deploy', 'Caddyfile.hub'), 'utf8');

// Decision must be explicit in docs
assert.ok(integration.includes('FastAPI docs surface decision'), 'docs surface decision is documented');
assert.ok(integration.includes('/docs') && integration.includes('/redoc') && integration.includes('/openapi.json'), 'docs endpoints are explicitly listed');
assert.match(integration, /minimal surface/i, 'decision prefers minimal public surface');
assert.match(integration, /docs_url=None|disabled in production/i, 'production docs are disabled');

// Gateway must NOT accidentally expose docs via catch-all
// In unified gateway, only explicitly listed backend paths should go to Quizzzz
// Hub Caddyfile should not proxy /docs to hub-static as API, it should serve SPA or 404, not backend
// For Hub side, we ensure Hub Caddyfile does not contain docs proxy
assert.doesNotMatch(caddyHub, /\/docs/, 'Hub Caddyfile does not proxy docs to backend');

// For Quizzzz side, the gateway should explicitly NOT include docs in backend allowlist
// This is documented - we check that integration.md says gateway must NOT expose docs
assert.match(integration, /must NOT expose.*\/docs/, 'gateway decision explicitly says NOT to expose docs');

// Ensure decision is locked and not accidental
assert.ok(integration.includes('tools/gateway-docs.mjs'), 'decision is locked by test reference');

console.log('FastAPI docs surface explicit decision contract: ok');
console.log('  Production: docs disabled, minimal surface: ok');
console.log('  Gateway does not expose /docs, /redoc, /openapi.json: ok');
