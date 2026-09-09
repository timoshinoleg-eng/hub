#!/usr/bin/env node
import assert from 'node:assert/strict';
import { botStartConfig, MAX_UPDATE_TYPES } from '../bot/runtime.mjs';

assert.deepEqual(
  botStartConfig({ NODE_ENV: 'development' }),
  { mode: 'polling' },
  'development keeps local long polling'
);

assert.throws(
  () => botStartConfig({ NODE_ENV: 'production' }),
  /HUB_BOT_WEBHOOK_DOMAIN/,
  'production never falls back to polling without a webhook domain'
);

const productionEnv = {
  NODE_ENV: 'production',
  HUB_BOT_WEBHOOK_DOMAIN: 'https://quiz.chatbot24.su',
  HUB_BOT_WEBHOOK_PORT: '8788',
  HUB_BOT_WEBHOOK_PATH: '/hub/bot/webhook',
  HUB_BOT_WEBHOOK_SECRET: 'webhook-secret-0123456789abcdef-0123456789',
};
const production = botStartConfig(productionEnv);
assert.deepEqual(production, {
  mode: 'webhook',
  options: {
    domain: 'https://quiz.chatbot24.su',
    port: 8788,
    path: '/hub/bot/webhook',
    secret: 'webhook-secret-0123456789abcdef-0123456789',
    allowedUpdates: MAX_UPDATE_TYPES,
  },
}, 'production uses the explicit HTTPS webhook endpoint and required updates');

for (const invalid of [
  { HUB_BOT_WEBHOOK_DOMAIN: 'http://quiz.chatbot24.su' },
  { HUB_BOT_WEBHOOK_PORT: '0' },
  { HUB_BOT_WEBHOOK_PATH: 'hub/bot/webhook' },
  { HUB_BOT_WEBHOOK_SECRET: '' },
]) {
  assert.throws(
    () => botStartConfig({ ...productionEnv, ...invalid }),
    /Unsafe production bot config/,
    'production rejects unsafe webhook configuration'
  );
}

console.log('bot runtime production webhook contract: ok');
