const revision = window.HUB_ASSET_REVISION || '20260911-rc1';
const { routeQuizzzzLaunch } = await import(`./launch-router.js?v=${encodeURIComponent(revision)}`);

if (!routeQuizzzzLaunch()) {
  await import(`./main.js?v=${encodeURIComponent(revision)}`);
}
