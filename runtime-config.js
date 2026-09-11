const HUB_ASSET_REVISION = '20260911-rc1';

window.HUB_CONFIG = Object.assign({
  bot: '',
  hubName: 'Игротека',
  policyUrl: '',
  offerUrl: '',
  orgName: '',
  notificationsEnabled: false,
}, window.HUB_CONFIG || {});
window.HUB_ASSET_REVISION = HUB_ASSET_REVISION;

// MAX can retain a document/module shell between launches. A legacy cached
// shell still requests this deployment-owned file, so recover through the
// versioned bootstrap. bootstrap preserves Quizzzz launch routing before Hub.
if (!window.__HUB_DYNAMIC_BOOT__) {
  const script = document.createElement('script');
  script.type = 'module';
  script.src = `js/bootstrap.js?v=${encodeURIComponent(HUB_ASSET_REVISION)}`;
  document.head.appendChild(script);
}
