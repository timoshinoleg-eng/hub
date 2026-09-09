const HUB_ASSET_REVISION = '20260910-1';

window.HUB_CONFIG = {
  bot: '',
  hubName: 'Игротека',
  policyUrl: '',
  offerUrl: '',
  orgName: '',
  notificationsEnabled: false,
};
window.HUB_ASSET_REVISION = HUB_ASSET_REVISION;

// MAX keeps the document shell between launches on some Android clients. An
// old shell still requests this uncached file, so it can load the fixed menu.
if (!window.__HUB_DYNAMIC_BOOT__) {
  const script = document.createElement('script');
  script.type = 'module';
  script.src = `js/main.js?v=${encodeURIComponent(HUB_ASSET_REVISION)}`;
  document.head.appendChild(script);
}
