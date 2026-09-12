const rev = encodeURIComponent(window.HUB_ASSET_REVISION || '20260912-quizzzz');
const { routeQuizzzzLaunch } = await import(`./launch-router.js?v=${rev}`);
if (!routeQuizzzzLaunch()) {
  await import(`./main.js?v=${rev}`);
}
