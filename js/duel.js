/**
 * duel.js — чистая логика «дуэли»: сравнение счёта с челленджем из deep link.
 * Выделено в отдельный модуль, чтобы его можно было тестировать в Node
 * без браузера (см. tools/duel.mjs).
 *
 * challenge — счёт соперника, переданный в ссылке g<id>_s<score>.
 * higherIsBetter — true для большинства игр (больше = лучше); false для
 * «Памяти», где побеждает меньшее число ходов.
 */
export function duelResult(score, challenge, higherIsBetter = true) {
  if (challenge == null) return null;
  const tie = score === challenge;
  const won = higherIsBetter ? score >= challenge : score <= challenge;
  return { won, tie, score, challenge };
}
