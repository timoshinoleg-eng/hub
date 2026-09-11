#!/usr/bin/env node
import assert from 'node:assert/strict';
import { notificationConfigProblems, notificationsEnabled } from '../server/notifications.mjs';

assert.equal(notificationsEnabled(), false, 'subscriptions are off without an explicit opt-in');
assert.equal(notificationsEnabled('false'), false, 'the string false keeps subscriptions disabled');
assert.equal(notificationsEnabled('TRUE'), true, 'explicit true enables subscriptions case-insensitively');
assert.equal(notificationsEnabled('yes'), false, 'ambiguous values never enable subscriptions');

assert.match(
  notificationConfigProblems({ HUB_NOTIFICATIONS_ENABLED: 'true' }).join('; '),
  /HUB_POLICY_URL/,
  'identity-bearing subscriptions need a published policy'
);
assert.deepEqual(notificationConfigProblems({
  HUB_NOTIFICATIONS_ENABLED: 'true',
  HUB_ORG_NAME: 'ООО «Игротека»',
  HUB_ORG_INN: '1234567890',
  HUB_POLICY_URL: 'https://example.ru/privacy',
  HUB_OFFER_URL: 'https://example.ru/offer',
  HUB_SUPPORT_EMAIL: 'support@example.ru',
}), [], 'complete public operator details permit an explicit subscription launch');

console.log('notification privacy gate contract: ok');
