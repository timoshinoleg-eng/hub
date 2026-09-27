const HUB_ASSET_REVISION = '20260916-games12';

window.HUB_CONFIG = {
  bot: '',
  hubName: 'Игротека',
  policyUrl: '',
  offerUrl: '',
  orgName: '',
  notificationsEnabled: false,
};
window.HUB_ASSET_REVISION = HUB_ASSET_REVISION;

// Аналитика. Пустое значение = события не уходят вообще.
// По умолчанию задаётся тот же origin, что и оболочка: в production это
// /hub-api/ev, см. deploy/Caddyfile.hub. Так аналитика работает без CORS и
// без отдельного домена, а CSP `connect-src 'self'` её разрешает.
// Перед включением проверьте, что server действительно запущен: иначе
// браузер будет отправлять beacon в 502 и молча терять события.
window.HUB_TRACK_ENDPOINT = '/hub-api/ev';

// MAX keeps the document shell between launches on some Android clients. An
// old shell still requests this uncached file, so it can load the fixed menu.
if (!window.__HUB_DYNAMIC_BOOT__) {
  const script = document.createElement('script');
  script.type = 'module';
  script.src = `js/bootstrap.js?v=${encodeURIComponent(HUB_ASSET_REVISION)}`;
  document.head.appendChild(script);
}
