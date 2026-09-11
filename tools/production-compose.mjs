#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compose = readFileSync(join(root, 'deploy', 'compose.production.yml'), 'utf8');
const nginx = readFileSync(join(root, 'deploy', 'nginx.conf'), 'utf8');

assert.match(compose, /HUB_EXTRA_CA_CERT/, 'production compose requires the operator CA bundle path');
assert.match(compose, /NODE_EXTRA_CA_CERTS/, 'Node validates MAX TLS with the mounted CA bundle');
assert.match(compose, /\/app\/certs\/extra-ca\.crt:ro/, 'the CA bundle is mounted read-only into runtime containers');
assert.ok(nginx.includes('location ~* \\.(?:html|js)$'), 'HTML and JavaScript have an explicit cache policy');
assert.match(nginx, /Cache-Control "no-cache, must-revalidate"/, 'the shell and bridge are revalidated before each MAX launch');

console.log('production compose and static-cache contract: ok');
