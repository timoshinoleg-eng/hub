const WEBHOOK_PATH_PATTERN = /^\/[A-Za-z0-9._~\/-]+$/;
const HTTPS_ORIGIN_PATTERN = /^https:\/\/[^/]+(?:\/.*)?$/i;

export const MAX_UPDATE_TYPES = Object.freeze([
  'bot_started',
  'message_callback',
  'message_created',
]);

function positivePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

export function botStartConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return { mode: 'polling' };

  const domain = String(env.HUB_BOT_WEBHOOK_DOMAIN || '').trim();
  const port = positivePort(env.HUB_BOT_WEBHOOK_PORT);
  const path = String(env.HUB_BOT_WEBHOOK_PATH || '').trim();
  const secret = String(env.HUB_BOT_WEBHOOK_SECRET || '');
  const problems = [];
  if (!HTTPS_ORIGIN_PATTERN.test(domain)) problems.push('HUB_BOT_WEBHOOK_DOMAIN must be an HTTPS URL');
  if (port === null) problems.push('HUB_BOT_WEBHOOK_PORT must be a valid port');
  if (!WEBHOOK_PATH_PATTERN.test(path)) problems.push('HUB_BOT_WEBHOOK_PATH must start with /');
  if (secret.length < 32) problems.push('HUB_BOT_WEBHOOK_SECRET must be at least 32 characters');
  if (problems.length) throw new Error(`Unsafe production bot config: ${problems.join('; ')}`);

  return {
    mode: 'webhook',
    options: { domain, port, path, secret, allowedUpdates: MAX_UPDATE_TYPES },
  };
}
