export function notificationsEnabled(value = process.env.HUB_NOTIFICATIONS_ENABLED) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function httpsUrl(value) {
  try { return new URL(String(value || '')).protocol === 'https:'; } catch { return false; }
}

export function notificationConfigProblems(env = process.env) {
  if (!notificationsEnabled(env.HUB_NOTIFICATIONS_ENABLED)) return [];
  const problems = [];
  if (!String(env.HUB_ORG_NAME || '').trim()) problems.push('HUB_ORG_NAME is required');
  if (!/^\d{10}(\d{2})?$/.test(String(env.HUB_ORG_INN || ''))) problems.push('HUB_ORG_INN must contain 10 or 12 digits');
  if (!httpsUrl(env.HUB_POLICY_URL)) problems.push('HUB_POLICY_URL must be HTTPS');
  if (!httpsUrl(env.HUB_OFFER_URL)) problems.push('HUB_OFFER_URL must be HTTPS');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(env.HUB_SUPPORT_EMAIL || ''))) problems.push('HUB_SUPPORT_EMAIL must be an email');
  return problems;
}
