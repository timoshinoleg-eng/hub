/**
 * Проверенные upstream-ревизии игровых доноров.
 *
 * Зачем это нужно. Раньше vendor.mjs требовал лишь наличия папки исходников,
 * поэтому `npm run vendor` всегда тянул актуальный HEAD. Для активного
 * апстрима это означало, что рутинный запуск мог принести новый код, который
 * ещё не проходил наш аудит лицензий и ассетов; для заброшенного — что сверить
 * адаптацию с апстримом уже нечем.
 *
 * Теперь ревизия зафиксирована явно. Обновление донора — осознанное действие:
 * поднять SHA, прогнать `npm run vendor && npm run smoke`, проверить дифф и
 * только потом коммитить.
 *
 * Состояние донора отражает реальность, а не пожелание:
 *   archived: true означает, что апстрим больше не обновляется и diff против
 *   него недоступен — такие игры придётся вести вручную.
 */
export const UPSTREAM_SOURCES = {
  'he-is-talha/html-css-javascript-games': {
    url: 'https://github.com/he-is-talha/html-css-javascript-games',
    license: 'MIT',
    licenseFile: 'licenses/he-is-talha-MIT.txt',
    // Проверенная ревизия, из которой брались merge/reaction/snake/sapper/
    // quiz/echo/memory/sudoku/lights/nonogram/battleship.
    sha: '8c366fdf605f',
    archived: false,
  },
  'ChanMeng666/html-brick-game': {
    url: 'https://github.com/ChanMeng666/html-brick-game',
    license: 'MIT',
    licenseFile: 'licenses/html-brick-game-MIT.txt',
    sha: 'b4d9a756ecc8',
    // Апстрим архивирован: новых ревизий не будет, и diff против него
    // недоступен для верификации адаптации. Игра brick работает и покрыта
    // product-контрактом, но её правки придётся принимать на ревью без
    // возможности сверить с исходником.
    archived: true,
  },
};

/**
 * id -> папка в пакете he-is-talha/... (vendor.mjs).
 * Список живёт здесь, а не в vendor.mjs, чтобы источник правды по играм был
 * один и проверялся контрактом происхождения.
 */
export const VENDORED_GAMES = {
  merge: '10-2048-Game',
  reaction: '35-Whack-A-Mole-Game',
  snake: '24-Snake-Game',
  sapper: '16-Minesweeper-Game',
  quiz: '33-Quiz-Game',
  echo: '36-Simon-Says-Game',
  memory: '22-Memory-Card-Game',
  sudoku: '06-Sudoku-Game',
  lights: '50-Lights-Out-Game',
  nonogram: '49-Nonogram-Game',
  battleship: '48-Battleship-Game',
};

/**
 * Игры, внесённые вручную: их нет в vendor-пайплайне, потому что донор другой.
 * Ревизия фиксируется здесь, чтобы происхождение файлов в games/ оставалось
 * прослеживаемым.
 *
 * `quiz` в этот список НЕ входит: он проходит обычный vendor-пайплайн из
 * 33-Quiz-Game, но его index.html/style.css/script.js затем целиком
 * подменяются каноническим handoff-ом на /quiz/ (см. tools/overrides/).
 * То есть исходная ревизия викторины из апстрима не используется вовсе —
 * пользовательский код игры живёт в paired-репозитории Quizzzz.
 */
export const MANUAL_GAMES = {
  brick: { source: 'ChanMeng666/html-brick-game', reason: 'отдельный донор, не входит в пакет he-is-talha; upstream архивирован' },
};
