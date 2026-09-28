const rev = encodeURIComponent(window.HUB_ASSET_REVISION || 'dev');
const { routeQuizzzzLaunch } = await import(`./launch-router.js?v=${rev}`);
if (!routeQuizzzzLaunch()) {
  await import(`./main.js?v=${rev}`);
}
