/**
 * Единый реестр канонических override-файлов.
 *
 * Раньше список жил в двух местах: vendor-overrides.mjs копировал 20 файлов, а
 * check.mjs сверял байты только для 12. Расхождение было неочевидным и
 * опасным: `npm run vendor` молча заменял 8 игровых файлов непроверенными
 * копиями, а `npm run check` оставался зелёным.
 *
 * Теперь список единственный, и любая пара обязана совпадать байт в байт.
 */
export const OVERRIDE_PAIRS = [
  ['merge-index.html', 'games/merge/index.html'],
  ['merge-style.css', 'games/merge/style.css'],
  ['merge-script.js', 'games/merge/script.js'],
  ['quiz-index.html', 'games/quiz/index.html'],
  ['quiz-style.css', 'games/quiz/style.css'],
  ['quiz-script.js', 'games/quiz/script.js'],
  ['reaction-index.html', 'games/reaction/index.html'],
  ['reaction-style.css', 'games/reaction/style.css'],
  ['reaction-script.js', 'games/reaction/script.js'],
  ['snake-index.html', 'games/snake/index.html'],
  ['snake-style.css', 'games/snake/style.css'],
  ['snake-script.js', 'games/snake/script.js'],
  ['sapper-index.html', 'games/sapper/index.html'],
  ['sapper-style.css', 'games/sapper/style.css'],
  ['sapper-script.js', 'games/sapper/script.js'],
  ['echo-index.html', 'games/echo/index.html'],
  ['echo-style.css', 'games/echo/style.css'],
  ['echo-script.js', 'games/echo/script.js'],
  ['memory-index.html', 'games/memory/index.html'],
  ['memory-style.css', 'games/memory/style.css'],
  ['memory-script.js', 'games/memory/script.js'],
];
