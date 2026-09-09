import { routeQuizzzzLaunch } from './launch-router.js';

if (!routeQuizzzzLaunch()) {
  await import('./main.js');
}
