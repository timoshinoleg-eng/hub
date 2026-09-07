#!/usr/bin/env node
/**
 * vendor.mjs — переносит игры из пакета he-is-talha/html-css-javascript-games в hub/games.
 *
 * Делает три вещи:
 *   1. копирует только разрешённые игры (см. GAMES)
 *   2. удаляет чужие ассеты (PNG/JPG неизвестного происхождения, MIT на код их не покрывает)
 *   3. применяет патчи (тач-управление, русский текст, баги) и встраивает _boot.js
 *
 * Запуск:  node tools/vendor.mjs [--src ../.tmp-pack]
 * Идемпотентен: можно запускать сколько угодно, результат одинаков.
 */
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argSrc = process.argv.indexOf('--src');
const SRC = argSrc !== -1 ? process.argv[argSrc + 1] : join(ROOT, '..', '.tmp-pack');
const GAMES_DIR = join(ROOT, 'games');

if (!existsSync(SRC)) {
  console.error(`Нет исходников: ${SRC}\nСначала: git clone --depth 1 https://github.com/he-is-talha/html-css-javascript-games.git .tmp-pack`);
  process.exit(1);
}

/** id -> папка в паке. Только игры, прошедшие трёхслойный аудит. */
const GAMES = {
  merge:    '10-2048-Game',
  reaction: '35-Whack-A-Mole-Game',
  snake:    '24-Snake-Game',
  sapper:   '16-Minesweeper-Game',
  quiz:     '33-Quiz-Game',
  echo:     '36-Simon-Says-Game',
  memory:   '22-Memory-Card-Game',
};

/** Что удалить после копирования — чужие ассеты. */
const DELETE_ASSETS = {
  memory: ['images'],
};

const SWIPE = (vertical) => `
let __tsX = 0, __tsY = 0;
document.addEventListener("touchstart", (e) => { __tsX = e.touches[0].clientX; __tsY = e.touches[0].clientY; }, { passive: true });
document.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - __tsX;
  const dy = e.changedTouches[0].clientY - __tsY;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  ${vertical}
}, { passive: true });`;

/**
 * Патчи. Каждый — точная строковая замена. Если замена не находится,
 * скрипт падает с явной ошибкой — молча не проходит ни одна правка.
 */
/**
 * Детерминированный «пазл дня»: если в URL игры есть ?seed=YYYY-MM-DD,
 * раскладка/порядок одинаковы у всех за этот день. Блок встраивается в
 * script.js и даёт __hubRand() — обычный Math.random(), если seed не задан.
 */
const DAILY_SEED = `
// «Пазл дня»: при ?seed=YYYY-MM-DD раскладка детерминирована для всех за этот день.
const __hubParams = new URLSearchParams(location.search);
const __hubSeed = __hubParams.get("seed");
function __hubHash(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return (h >>> 0); }
let __hubSeedState = __hubSeed ? __hubHash(__hubSeed) : 0;
function __hubRand() {
  if (!__hubSeed) return Math.random();
  let t = (__hubSeedState += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}`;

const PATCHES = {
  // ── Мердж (2048) ────────────────────────────────────────────────────────
  merge: [
    // Баг исходника: combineRow склеивает плитки через границу строки (i=3,4),
    // потому что нет проверки i % 4 === 3.
    {
      file: 'script.js',
      from: `    for (let i = 0; i < 15; i++) {
      if (squares[i].innerHTML === squares[i + 1].innerHTML) {`,
      to: `    for (let i = 0; i < 15; i++) {
      if (i % 4 === 3) continue;
      if (squares[i].innerHTML === squares[i + 1].innerHTML) {`,
    },
    { file: 'script.js', from: 'resultDisplay.innerHTML = "You WIN";', to: 'resultDisplay.innerHTML = "Победа!";' },
    { file: 'script.js', from: 'resultDisplay.innerHTML = "You LOSE";', to: 'resultDisplay.innerHTML = "Игра окончена";' },
    // В исходнике только клавиатура — на телефоне игра неиграбельна.
    {
      file: 'script.js',
      from: `  var myTimer = setInterval(addColours, 50);
});`,
      to: `  var myTimer = setInterval(addColours, 50);
${SWIPE(`if (Math.abs(dx) > Math.abs(dy)) { dx > 0 ? keyRight() : keyLeft(); } else { dy > 0 ? keyDown() : keyUp(); }`)}
});`,
    },
  ],

  // ── Реакция (Whack-A-Mole) ──────────────────────────────────────────────
  reaction: [
    // 10 секунд — мало, 60 — много для мессенджера. 30 — норма.
    { file: 'script.js', from: '  }, 10000);', to: '  }, 30000);' },
    { file: 'script.js', from: 'button.innerHTML = "Try again?";', to: 'button.innerHTML = "Ещё раз?";' },
    // click на мобильных даёт задержку ~300 мс — в игре на реакцию это фатально.
    {
      file: 'script.js',
      from: 'moles.forEach((mole) => mole.addEventListener("click", bonk));',
      to: `moles.forEach((mole) => {
  mole.addEventListener("click", bonk);
  mole.addEventListener("touchstart", (e) => { e.preventDefault(); bonk.call(mole, e); }, { passive: false });
});`,
    },
    {
      file: 'script.js',
      from: `  setTimeout(() => {
    timeUp = true;
    button.innerHTML = "Ещё раз?";
    button.style.visibility = "visible";
  }, 30000);`,
      to: `  setTimeout(() => {
    timeUp = true;
    window.parent.postMessage({ __hub: 1, type: "finish", score }, "*");
    button.innerHTML = "Ещё раз?";
    button.style.visibility = "visible";
  }, 30000);`,
    },
  ],

  // ── Змейка ──────────────────────────────────────────────────────────────
  snake: [
    { file: 'script.js', from: '`High Score: ${highScore}`', to: '`Рекорд: ${highScore}`', all: true },
    { file: 'script.js', from: '`Score: ${score}`', to: '`Счёт: ${score}`' },
    // alert() + location.reload() внутри iframe в мессенджере — худший из возможных финалов.
    {
      file: 'script.js',
      from: `    clearInterval(setIntervalId);
    alert("Game Over! Press OK to replay...");
    location.reload();`,
      to: `    clearInterval(setIntervalId);
    window.parent.postMessage({ __hub: 1, type: "finish", score }, "*");
    const __o = document.createElement("div");
    __o.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);z-index:99"><div style="background:#1d2b1f;padding:24px 28px;border-radius:14px;text-align:center;color:#eaf3ea;font-family:sans-serif"><div style="font-size:20px;font-weight:700;margin-bottom:6px">Игра окончена</div><div style="font-size:15px;opacity:.85;margin-bottom:16px">Счёт: ' + score + '</div><button id="hub-again" style="padding:10px 26px;border:0;border-radius:9px;background:#4caf50;color:#fff;font-size:15px;font-weight:600">Ещё раз</button></div></div>';
    document.body.appendChild(__o);
    document.getElementById("hub-again").onclick = () => location.reload();`,
    },
    {
      file: 'script.js',
      from: `updateFoodPosition();
setIntervalId = setInterval(initGame, 100);`,
      to: `updateFoodPosition();
velocityX = 1; velocityY = 0;
setIntervalId = setInterval(initGame, 100);
${SWIPE(`changeDirection({ key: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "ArrowRight" : "ArrowLeft") : (dy > 0 ? "ArrowDown" : "ArrowUp") });`)}`,
    },
  ],

  // ── Сапёр (Minesweeper) ──────────────────────────────────────────────────
  sapper: [
    // Убираем отладочный вывод.
    { file: 'script.js', from: '  console.log(board);', to: '' },
    // Хелперы метрик (счёт и финиш шлём напрямую в хаб, без парсинга DOM).
    {
      file: 'script.js',
      from: 'let gameOver = false;',
      to: `let gameOver = false;

let __hubDone = false;
function hubScore(s) { window.parent.postMessage({ __hub: 1, type: "score", value: s }, "*"); }
function hubFinish(s) { if (__hubDone) return; __hubDone = true; window.parent.postMessage({ __hub: 1, type: "finish", score: s }, "*"); }
function flagTile(tile) {
  if (gameOver) return;
  if (tile.innerText == "") tile.innerText = "🚩";
  else if (tile.innerText == "🚩") tile.innerText = "";
}`,
    },
    // Тап на мобильном: touchstart вместо click — убирает задержку ~300 мс.
    {
      file: 'script.js',
      from: '      tile.addEventListener("click", clickTile);',
      to: `      tile.addEventListener("click", clickTile);
      tile.addEventListener("touchstart", (e) => { e.preventDefault(); clickTile.call(tile); }, { passive: false });`,
    },
    // Проигрыш: показать мины и отправить финиш со счётом.
    {
      file: 'script.js',
      from: `    // alert("GAME OVER");
    gameOver = true;
    revealMines();
    return;`,
      to: `    gameOver = true;
    revealMines();
    hubFinish(tilesClicked);
    return;`,
    },
    // Каждое открытое поле — это очко.
    {
      file: 'script.js',
      from: `  board[r][c].classList.add("tile-clicked");
  tilesClicked += 1;`,
      to: `  board[r][c].classList.add("tile-clicked");
  tilesClicked += 1;
  hubScore(tilesClicked);`,
    },
    // Победа: все безопасные клетки открыты.
    {
      file: 'script.js',
      from: `  if (tilesClicked == rows * columns - minesCount) {
    document.getElementById("mines-count").innerText = "Cleared";
    gameOver = true;
  }`,
      to: `  if (tilesClicked == rows * columns - minesCount) {
    document.getElementById("mines-count").innerText = "Победа!";
    gameOver = true;
    hubFinish(tilesClicked);
  }`,
    },
    // Русский заголовок.
    { file: 'index.html', from: '    <h1>Mines: <span id="mines-count">0</span></h1>', to: '    <h1>Мины: <span id="mines-count">0</span></h1>' },
    // Сторонний favicon — лишний внешний запрос.
    { file: 'index.html', re: /\s*<link rel="icon"[^>]*>/g, to: '' },
    // Адаптив: доска под ширину экрана, плитки — в процентах.
    {
      file: 'style.css',
      from: `#board {
  width: 400px;
  height: 400px;
  border: 10px solid darkgray;
  background-color: lightgray;

  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
}

#board div {
  width: 48px;
  height: 48px;
  border: 1px solid whitesmoke;

  /* text */
  font-size: 30px;
  display: flex;
  justify-content: center;
  align-items: center;
}`,
      to: `#board {
  width: min(94vw, 400px);
  height: min(94vw, 400px);
  border: 10px solid darkgray;
  background-color: lightgray;

  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
}

#board div {
  width: 12.5%;
  height: 12.5%;
  box-sizing: border-box;
  border: 1px solid whitesmoke;

  /* text */
  font-size: clamp(16px, 5vw, 30px);
  display: flex;
  justify-content: center;
  align-items: center;
}`,
    },
    // «Пазл дня»: детерминированная раскладка мин при ?seed.
    {
      file: 'script.js',
      from: 'window.onload = function () {',
      to: `${DAILY_SEED}\n\nwindow.onload = function () {`,
    },
    {
      file: 'script.js',
      from: 'let r = Math.floor(Math.random() * rows);',
      to: 'let r = Math.floor(__hubRand() * rows);',
    },
    {
      file: 'script.js',
      from: 'let c = Math.floor(Math.random() * columns);',
      to: 'let c = Math.floor(__hubRand() * columns);',
    },
  ],

  // ── Викторина (Quiz) ───────────────────────────────────────────────────
  quiz: [
    // Русский пул вопросов (20). Общие знания, без спорного.
    {
      file: 'script.js',
      re: /const quizData = \[[\s\S]*?\];/,
      to: `const quizData = [
  { question: "Столица России?", options: ["Москва", "Санкт-Петербург", "Казань", "Новосибирск"], answer: "Москва" },
  { question: "Сколько планет в Солнечной системе?", options: ["7", "8", "9", "10"], answer: "8" },
  { question: "Какая гора самая высокая?", options: ["Эверест", "К2", "Эльбрус", "Монблан"], answer: "Эверест" },
  { question: "Сколько континентов на Земле?", options: ["5", "6", "7", "8"], answer: "7" },
  { question: "Кто автор «Войны и мира»?", options: ["Толстой", "Достоевский", "Чехов", "Тургенев"], answer: "Толстой" },
  { question: "Сколько дней в високосном году?", options: ["365", "366", "364", "367"], answer: "366" },
  { question: "Какая планета «красная»?", options: ["Марс", "Венера", "Юпитер", "Сатурн"], answer: "Марс" },
  { question: "Кто написал музыку гимна России?", options: ["Александров", "Чайковский", "Глинка", "Моцарт"], answer: "Александров" },
  { question: "Сколько цветов в радуге?", options: ["5", "6", "7", "8"], answer: "7" },
  { question: "Какое озеро самое большое?", options: ["Каспийское", "Байкал", "Виктория", "Онтарио"], answer: "Каспийское" },
  { question: "На каком языке говорят в Бразилии?", options: ["португальский", "испанский", "французский", "английский"], answer: "португальский" },
  { question: "Сколько месяцев в году?", options: ["10", "11", "12", "13"], answer: "12" },
  { question: "Столица Японии?", options: ["Токио", "Киото", "Осака", "Нагойя"], answer: "Токио" },
  { question: "Кто изобрёл лампочку?", options: ["Эдисон", "Ньютон", "Эйнштейн", "Гальвани"], answer: "Эдисон" },
  { question: "Какая планета ближе всего к Солнцу?", options: ["Меркурий", "Венера", "Земля", "Марс"], answer: "Меркурий" },
  { question: "Сколько часов в сутках?", options: ["12", "24", "36", "48"], answer: "24" },
  { question: "Какое животное — «царь зверей»?", options: ["лев", "тигр", "медведь", "волк"], answer: "лев" },
  { question: "Сколько сторон у треугольника?", options: ["3", "4", "5", "6"], answer: "3" },
  { question: "Какая стихия нужна всем живым существам?", options: ["вода", "бензин", "молоко", "сок"], answer: "вода" },
  { question: "Кто летает выше всех?", options: ["птица", "самолёт", "ракета", "воздушный шар"], answer: "ракета" },
];`,
    },
    // Хелперы метрик.
    {
      file: 'script.js',
      from: 'let currentQuestion = 0;',
      to: 'let __hubDone = false;\nfunction hubScore(s) { window.parent.postMessage({ __hub: 1, type: "score", value: s }, "*"); }\nfunction hubFinish(s) { if (__hubDone) return; __hubDone = true; window.parent.postMessage({ __hub: 1, type: "finish", score: s }, "*"); }\nlet currentQuestion = 0;',
    },
    // Русский текст результата + отправка метрик.
    { file: 'script.js', from: 'You scored ${score} out of ${quizData.length}!`', to: 'Ваш результат: ${score} из ${quizData.length}`' },
    { file: 'script.js', from: '}\n\nfunction retryQuiz() {', to: '  hubScore(score);\n  hubFinish(score);\n}\n\nfunction retryQuiz() {' },
    { file: 'script.js', from: 'You scored ${score} out of ${quizData.length}!', to: 'Ваш результат: ${score} из ${quizData.length}.' },
    // Перемешиваем вопросы при каждом запуске.
    {
      file: 'script.js',
      from: 'showAnswerButton.addEventListener("click", showAnswer);\n\ndisplayQuestion();',
      to: 'showAnswerButton.addEventListener("click", showAnswer);\n\nquizData.sort(() => Math.random() - 0.5);\ndisplayQuestion();',
    },
    // Русские кнопки и заголовки в HTML.
    { file: 'index.html', from: '>Submit<', to: '>Ответить<' },
    { file: 'index.html', from: '>Retry<', to: '>Ещё раз<' },
    { file: 'index.html', from: '>Show Answer<', to: '>Показать ответы<' },
    { file: 'index.html', from: '    <h1 style="margin-bottom: 2px;">Quiz App</h1>', to: '    <h1 style="margin-bottom: 2px;">Викторина</h1>' },
    { file: 'index.html', from: '      <h4 style="margin-top: 0px;">20 Questions</h4>', to: '      <h4 style="margin-top: 0px;">20 вопросов</h4>' },
    { file: 'index.html', re: /\s*<link rel="icon"[^>]*>/g, to: '' },
    // «Пазл дня»: детерминированный порядок вопросов и вариантов при ?seed.
    {
      file: 'script.js',
      from: 'function shuffleArray(array) {',
      to: `${DAILY_SEED}\n\nfunction shuffleArray(array) {`,
    },
    {
      file: 'script.js',
      from: 'const j = Math.floor(Math.random() * (i + 1));',
      to: 'const j = Math.floor(__hubRand() * (i + 1));',
    },
    {
      file: 'script.js',
      from: 'quizData.sort(() => Math.random() - 0.5);',
      to: 'quizData.sort(() => __hubRand() - 0.5);',
    },
  ],

  // ── Эхо (Simon Says) ────────────────────────────────────────────────────
  echo: [
    // Хелперы метрик.
    {
      file: 'script.js',
      from: 'let gameStarted = false;',
      to: `let gameStarted = false;

let __hubDone = false;
function hubScore(s) { window.parent.postMessage({ __hub: 1, type: "score", value: s }, "*"); }
function hubFinish(s) { if (__hubDone) return; __hubDone = true; window.parent.postMessage({ __hub: 1, type: "finish", score: s }, "*"); }`,
    },
    // «Уровень N» вместо «Level N» (два вхождения).
    { file: 'script.js', from: 'Level ${level}', to: 'Уровень ${level}', all: true },
    // Исправляем баг: missedColor не определён → берём правильный цвет.
    { file: 'script.js', from: 'flashButton(missedColor);', to: 'flashButton(gamePattern[userPattern.length - 1]);' },
    // Русский статус проигрыша.
    { file: 'script.js', from: 'textContent = `Game Over!`;', to: 'textContent = `Игра окончена`;' },
    { file: 'script.js', from: '  const message = `Game Over! Correct color was ${\n    gamePattern[userPattern.length - 1]\n  }.`;', to: '  const message = `Игра окончена. Нужен был цвет ${\n    gamePattern[userPattern.length - 1]\n  }.`;' },
    { file: 'script.js', from: 'Congrats! You passed level ${level}!', to: 'Поздравляем! Уровень ${level} пройден!' },
    // Отправляем финиш на проигрыше.
    {
      file: 'script.js',
      from: `    showLoseMessage();
    setTimeout(() => {
      hideLoseMessage();
    }, 2000);`,
      to: `    showLoseMessage();
    hubFinish(level);
    setTimeout(() => {
      hideLoseMessage();
    }, 2000);`,
    },
    // Тач: привязываем touchstart рядом с click, preventDefault гасит 300 мс.
    {
      file: 'script.js',
      from: `function enableUserInput() {
  colors.forEach((color) => {
    document.getElementById(color).addEventListener("click", handleUserClick);
  });
}

function disableUserInput() {
  colors.forEach((color) => {
    document
      .getElementById(color)
      .removeEventListener("click", handleUserClick);
  });
}`,
      to: `function __echoTouch(e) { e.preventDefault(); handleUserClick(e); }
function enableUserInput() {
  colors.forEach((color) => {
    const b = document.getElementById(color);
    b.addEventListener("click", handleUserClick);
    b.addEventListener("touchstart", __echoTouch, { passive: false });
  });
}

function disableUserInput() {
  colors.forEach((color) => {
    const b = document.getElementById(color);
    b.removeEventListener("click", handleUserClick);
    b.removeEventListener("touchstart", __echoTouch);
  });
}`,
    },
    // Русский интерфейс в HTML.
    { file: 'index.html', from: '<h1>Simon Says Game</h1>', to: '<h1>Эхо</h1>' },
    { file: 'index.html', from: '<button id="start-btn">Start Game</button>', to: '<button id="start-btn">Начать</button>' },
    { file: 'index.html', from: '<html lang="en">', to: '<html lang="ru">' },
    { file: 'index.html', from: 'Current Sequence: <span id="sequence-display">-</span>', to: 'Последовательность: <span id="sequence-display">-</span>' },
    { file: 'index.html', from: 'Click Count: <span id="click-count">0</span>', to: 'Нажатий: <span id="click-count">0</span>' },
    { file: 'index.html', from: 'Game Status: <span id="status">Waiting...</span>', to: 'Статус: <span id="status">ожидание</span>' },
    { file: 'index.html', re: /\s*<link rel="icon"[^>]*>/g, to: '' },
  ],

  // ── Память (Memory) ─────────────────────────────────────────────────────
  memory: [
    // В index.html 32 тега <img> на удалённые файлы. Мало удалить картинки —
    // надо вычистить и разметку, иначе получаем 32 ошибки 404 в консоли.
    { file: 'index.html', re: /<img[^>]*>/g, to: '' },
    // Сторонний favicon — лишний внешний запрос из мини-приложения.
    { file: 'index.html', re: /\s*<link rel="icon"[^>]*>/g, to: '' },
    { file: 'index.html', from: '<html lang="en" dir="ltr">', to: '<html lang="ru" dir="ltr">' },
    { file: 'index.html', from: '<title>Talha - Memory Card Game</title>', to: '<title>Память</title>' },
    // 8 PNG неизвестного происхождения. Меняем на эмодзи: риск нулевой,
    // вес игры падает со 141 КБ до ~8 КБ.
    {
      file: 'script.js',
      from: 'const cards = document.querySelectorAll(".card");',
      to: `const EMOJI = ["🍎", "🍇", "🍓", "🍒", "🍑", "🥝", "🍍", "🍌"];
const cards = document.querySelectorAll(".card");`,
    },
    {
      file: 'script.js',
      from: `        let cardOneImg = cardOne.querySelector(".back-view img").src,
        cardTwoImg = cardTwo.querySelector(".back-view img").src;`,
      to: `        let cardOneImg = cardOne.dataset.emoji,
        cardTwoImg = cardTwo.dataset.emoji;`,
    },
    {
      file: 'script.js',
      from: `        let imgTag = card.querySelector(".back-view img");
        imgTag.src = \`images/img-\${arr[i]}.png\`;`,
      to: `        const back = card.querySelector(".back-view");
        card.dataset.emoji = EMOJI[arr[i] - 1];
        back.textContent = EMOJI[arr[i] - 1];
        back.style.cssText = "display:flex;align-items:center;justify-content:center;font-size:38px;line-height:1";`,
    },
    // Хелперы метрик + счётчик ходов.
    {
      file: 'script.js',
      from: 'let matched = 0;',
      to: `let matched = 0;
let moves = 0;
let __hubDone = false;
function hubScore(s) { window.parent.postMessage({ __hub: 1, type: "score", value: s }, "*"); }
function hubFinish(s) { if (__hubDone) return; __hubDone = true; window.parent.postMessage({ __hub: 1, type: "finish", score: s }, "*"); }`,
    },
    // Каждый второй переворот — ход; шлём счёт.
    {
      file: 'script.js',
      from: `        cardTwo = clickedCard;
        disableDeck = true;`,
      to: `        cardTwo = clickedCard;
        disableDeck = true;
        moves++;
        hubScore(moves);`,
    },
    // На полном совпадении — финиш со счётом, без бесконечного перемешивания.
    {
      file: 'script.js',
      from: `    if(img1 === img2) {
        matched++;
        if(matched == 8) {
            setTimeout(() => {
                return shuffleCard();
            }, 1000);
        }
        cardOne.removeEventListener("click", flipCard);
        cardTwo.removeEventListener("click", flipCard);
        cardOne = cardTwo = "";
        return disableDeck = false;
    }`,
      to: `    if(img1 === img2) {
        matched++;
        cardOne.removeEventListener("click", flipCard);
        cardTwo.removeEventListener("click", flipCard);
        cardOne = cardTwo = "";
        disableDeck = false;
        if(matched == 8) { hubFinish(moves); }
        return;
    }`,
    },
    // Тач на карточках.
    {
      file: 'script.js',
      from: `        back.style.cssText = "display:flex;align-items:center;justify-content:center;font-size:38px;line-height:1";
        card.addEventListener("click", flipCard);`,
      to: `        back.style.cssText = "display:flex;align-items:center;justify-content:center;font-size:38px;line-height:1";
        card.addEventListener("click", flipCard);
        card.addEventListener("touchstart", (e) => { e.preventDefault(); flipCard({ target: card }); }, { passive: false });`,
    },
  ],
};

/**
 * Чтение с нормализацией переводов строк: файлы пакета в CRLF, патчи пишутся
 * в LF. Без этого ни одна многострочная замена не совпадёт.
 */
function readNorm(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const VIEWPORT = '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">';

/**
 * Встраивание _boot.js перед </body> плюс viewport, если его не было:
 * без него игра на телефоне отрисуется в масштабе рабочего стола.
 */
function injectBoot(htmlPath, gameId) {
  let html = readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');
  if (html.includes('_boot.js')) return;
  if (!html.includes('</body>')) throw new Error(`нет </body> в ${htmlPath}`);

  if (!/<meta[^>]+viewport/i.test(html)) {
    html = html.replace(/(<head[^>]*>)/i, `$1\n  ${VIEWPORT}`);
  }
  html = html.replace('</body>', `<script src="../_boot.js" data-game="${gameId}"></script>\n</body>`);
  writeFileSync(htmlPath, html, 'utf8');
}

let done = 0;
for (const [id, srcDir] of Object.entries(GAMES)) {
  const from = join(SRC, srcDir);
  const to = join(GAMES_DIR, id);
  if (!existsSync(from)) { console.error(`  ! нет папки ${srcDir}`); continue; }

  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });

  for (const asset of DELETE_ASSETS[id] || []) {
    rmSync(join(to, asset), { recursive: true, force: true });
  }

  for (const p of PATCHES[id] || []) {
    const f = join(to, p.file);
    let s = readNorm(f);
    if (p.re) {
      if (!p.re.test(s)) throw new Error(`патч (regex) не применён: ${id}/${p.file} — ${p.re}`);
      s = s.replace(p.re, p.to);
    } else {
      if (!s.includes(p.from)) throw new Error(`патч не применён: ${id}/${p.file}\nожидалось:\n${p.from}`);
      s = p.all ? s.split(p.from).join(p.to) : s.replace(p.from, p.to);
    }
    writeFileSync(f, s, 'utf8');
  }

  injectBoot(join(to, 'index.html'), id);
  console.log(`  ok ${id.padEnd(9)} <- ${srcDir}`);
  done++;
}

console.log(`\nПеренесено игр: ${done}. Ассеты чужие удалены, _boot.js встроен.`);
