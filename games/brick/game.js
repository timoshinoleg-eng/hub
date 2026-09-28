/**
 * Кирпичи — оболочка над чистой физикой из physics.js.
 *
 * Разделение появилось не по вкусу, а по необходимости. Раньше физика,
 * отрисовка и планирование кадра жили в одной функции draw(), поэтому её нельзя
 * было ни протестировать без браузера, ни починить: движение мяча не зависело
 * от времени (x += 4 раз за кадр), и на 30 Гц игра шла вдвое медленнее, чем на
 * 60 Гц. В MAX WebView на горящем телефоне частота кадров проседает, и это был
 * не теоретический, а наблюдаемый дефект. Теперь считает physics.js, здесь
 * остаётся только ввод, отрисовка, звук и меню.
 *
 * Всё состояние игры — в world из physics.js. Здесь нет ни x, ни y, ни dx:
 * если бы они появились, физика снова начала бы расходиться с отрисовкой.
 */
(function () {
'use strict';

const physics = window.__hubBrickPhysics;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isSmallScreen = () => window.innerWidth < 768;
const isVerySmallScreen = () => window.innerWidth < 480;

// ── Размер холста ───────────────────────────────────────────────────────────
// Поле 4:3, как в оригинале. Размер выводится из окна, чтобы на телефоне
// холст не занимал меньше трети экрана.
function getOptimalCanvasSize() {
  const maxWidth = window.innerWidth - 40;
  const maxHeight = window.innerHeight - 40;
  const aspect = 4 / 3;
  let width;
  let height;
  if (isVerySmallScreen()) {
    width = Math.min(320, maxWidth);
    height = Math.min(240, maxHeight);
  } else if (isSmallScreen()) {
    width = Math.min(480, maxWidth);
    height = Math.min(360, maxHeight);
  } else {
    width = Math.min(800, maxWidth);
    height = Math.min(600, maxHeight);
  }
  if (width / height > aspect) width = height * aspect;
  else height = width / aspect;
  return { width: Math.floor(width), height: Math.floor(height) };
}

const BRICK_ROWS = 5;
const BRICK_COLUMNS = 9;

// ── Мир и состояние ─────────────────────────────────────────────────────────
let world = null;
let gameState = 'menu'; // 'menu' | 'playing' | 'paused'
let animationId = null;
let lastFrameTime = 0;

const tailParticles = [];
const BRICK_COLORS = [
  ['#ff6b6b', '#ff5252'],
  ['#4ecdc4', '#26a69a'],
  ['#45b7d1', '#2196f3'],
  ['#96ceb4', '#66bb6a'],
  ['#feca57', '#ffb74d'],
];

const performanceConfig = {
  maxParticles: isSmallScreen() ? 50 : 100,
  particleGenerationRate: isSmallScreen() ? 0.5 : 1,
  explosionParticleCount: isVerySmallScreen() ? 8 : (isSmallScreen() ? 10 : 15),
};

function buildWorld() {
  const size = getOptimalCanvasSize();
  canvas.width = size.width;
  canvas.height = size.height;
  world = physics.createWorld({
    width: size.width,
    height: size.height,
    brickRows: BRICK_ROWS,
    brickColumns: BRICK_COLUMNS,
  });
  physics.layoutBricks(world);
  physics.serveBall(world, 0);
  return world;
}

/** Пересобирает кирпичи под новый размер холста. Токены сохранены: на них
 *  завязан продуктовый контракт и ручная проверка геометрии. */
function layoutBricks() {
  if (!world) return buildWorld();
  physics.layoutBricks(world);
  return world;
}

function resizeCanvas() {
  if (!canvas) return;
  const oldWidth = world ? world.width : 0;
  const size = getOptimalCanvasSize();
  canvas.width = size.width;
  canvas.height = size.height;
  buildWorld();
  if (gameState === 'playing') physics.serveBall(world, 0);
  if (oldWidth && oldWidth !== size.width) tailParticles.length = 0;
}

// ── Интеграция с оболочкой хаба ────────────────────────────────────────────
let __hubDone = false;
function hubScore(s) { window.parent.postMessage({ __hub: 1, type: 'score', value: s }, '*'); }
function hubFinish(s) { if (__hubDone) return; __hubDone = true; window.parent.postMessage({ __hub: 1, type: 'finish', score: s }, '*'); }

// ── Ассеты ─────────────────────────────────────────────────────────────────
const starImage = new Image();
starImage.src = 'start.svg';
const paddleImage = new Image();
paddleImage.src = 'deer.svg';

function vibrateDevice(duration = 10) {
  if (isMobile && 'vibrate' in navigator) navigator.vibrate(duration);
}

// ── Звук ───────────────────────────────────────────────────────────────────
let audioContext = null;
try {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
} catch { /* без звука играть можно */ }

function playSound(frequency, duration, type = 'sine', volume = 0.3) {
  if (!audioContext || audioContext.state === 'suspended') return;
  try {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + duration);
  } catch { /* звук не должен ронять игру */ }
}

const playBrickHitSound = () => playSound(520, 0.08, 'triangle', 0.25);
const playPaddleHitSound = () => playSound(340, 0.09, 'sine', 0.25);
const playVictorySound = () => { playSound(660, 0.12, 'sine', 0.3); setTimeout(() => playSound(880, 0.18, 'sine', 0.3), 110); };
const playGameOverSound = () => { playSound(300, 0.2, 'sawtooth', 0.22); setTimeout(() => playSound(200, 0.3, 'sawtooth', 0.2), 150); };

let backgroundMusicPlaying = false;
function playBackgroundMusic() {
  if (!audioContext || backgroundMusicPlaying) return;
  backgroundMusicPlaying = true;
  // Мелодия проигрывается по одной ноте на такт: этого достаточно, чтобы
  // раунд ощущался живым, и не требует аудиофайла.
  const melody = [262, 294, 330, 349, 392, 440, 494, 523];
  let step = 0;
  const tick = () => {
    if (!backgroundMusicPlaying) return;
    playSound(melody[step % melody.length], 0.22, 'sine', 0.08);
    step++;
    setTimeout(tick, 340);
  };
  tick();
}
function stopBackgroundMusic() { backgroundMusicPlaying = false; }

// ── Частицы ────────────────────────────────────────────────────────────────
function generateCollisionEffect(x, y) {
  const count = performanceConfig.explosionParticleCount;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = 1.5 + Math.random() * 2.5;
    tailParticles.push({
      x, y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      alpha: 0.9,
      radius: 2 + Math.random() * 2.5,
    });
  }
}

function generateTailParticle(x, y) {
  if (Math.random() > performanceConfig.particleGenerationRate) return;
  tailParticles.push({
    x: x + (Math.random() - 0.5) * 6,
    y: y + (Math.random() - 0.5) * 6,
    dx: (Math.random() - 0.5) * 0.4,
    dy: 0.2 + Math.random() * 0.3,
    alpha: 0.6,
    radius: 1 + Math.random() * 1.5,
  });
}

// ── Отрисовка ──────────────────────────────────────────────────────────────
function drawBricks() {
  for (let c = 0; c < world.brickColumns; c++) {
    for (let r = 0; r < world.brickRows; r++) {
      const brick = world.bricks[c][r];
      if (!brick.alive) continue;
      const [light, dark] = BRICK_COLORS[r % BRICK_COLORS.length];
      const gradient = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + world.brickHeight);
      gradient.addColorStop(0, light);
      gradient.addColorStop(1, dark);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(brick.x, brick.y, world.brickWidth, world.brickHeight, 8);
      else ctx.rect(brick.x, brick.y, world.brickWidth, world.brickHeight);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = light;
      ctx.lineWidth = 2;
      ctx.shadowColor = light;
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.shadowBlur = 0;
      const highlight = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + world.brickHeight / 3);
      highlight.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
      highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = highlight;
      ctx.fill();
      ctx.closePath();
    }
  }
}

function drawPaddle() {
  if (!Number.isFinite(world.paddleX)) return;
  const scaleFactor = 1.2;
  const scaledWidth = world.paddleWidth * scaleFactor;
  const scaledHeight = world.paddleHeight * scaleFactor * 6;
  const offsetX = (scaledWidth - world.paddleWidth) / 2;
  const offsetY = (scaledHeight - world.paddleHeight) / 2;
  const cx = world.paddleX + world.paddleWidth / 2;
  const cy = canvas.height - world.paddleHeight / 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, scaledWidth / 2, scaledHeight / 4, 0, 0, Math.PI * 2);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, scaledWidth / 2);
  glow.addColorStop(0, 'rgba(0, 255, 100, 0.3)');
  glow.addColorStop(1, 'rgba(0, 255, 100, 0)');
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.closePath();
  ctx.drawImage(paddleImage, world.paddleX - offsetX, canvas.height - world.paddleHeight - offsetY, scaledWidth, scaledHeight);
}

function drawBall() {
  if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return;
  if (world.x <= 0 || world.y <= 0) return;
  const radius = world.ballRadius * 2;
  ctx.beginPath();
  ctx.arc(world.x, world.y, radius, 0, Math.PI * 2);
  if (radius > 0) {
    const glow = ctx.createRadialGradient(world.x, world.y, 0, world.x, world.y, radius);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    glow.addColorStop(0.5, 'rgba(0, 212, 255, 0.2)');
    glow.addColorStop(1, 'rgba(0, 212, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fill();
  }
  ctx.closePath();
  if (starImage.complete) ctx.drawImage(starImage, world.x - world.ballRadius, world.y - world.ballRadius, radius, radius);
}

function drawTailParticles() {
  if (tailParticles.length > performanceConfig.maxParticles) {
    tailParticles.splice(0, tailParticles.length - performanceConfig.maxParticles);
  }
  for (let i = tailParticles.length - 1; i >= 0; i--) {
    const p = tailParticles[i];
    p.x += p.dx;
    p.y += p.dy;
    p.alpha *= 0.98;
    p.radius *= 0.98;
    if (p.alpha < 0.05 || p.radius < 1) { tailParticles.splice(i, 1); continue; }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 212, 255, ${p.alpha})`;
    ctx.fill();
  }
}

function drawScore() {
  const fontSize = isVerySmallScreen() ? 14 : (isSmallScreen() ? 16 : 18);
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.fillStyle = '#00d4ff';
  ctx.shadowColor = '#00d4ff';
  ctx.shadowBlur = 10;
  ctx.fillText('ОЧКИ: ' + world.score, 15, 25);
  ctx.shadowBlur = 0;
  const text = 'ЖИЗНИ: ' + world.lives;
  const textWidth = ctx.measureText(text).width;
  ctx.fillText(text, canvas.width - textWidth - 15, 25);
  ctx.shadowBlur = 0;
}

function render() {
  if (!world) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  drawBricks();
  drawTailParticles();
  drawBall();
  drawPaddle();
  drawScore();
}

// ── Игровой цикл ───────────────────────────────────────────────────────────
/**
 * Один кадр: физика получает реальное время и сама решает, сколько шагов
 * выполнить. Раньше здесь стояло `x += 4` на кадр, то есть скорость мяча
 * была пропорциональна частоте кадров.
 */
function update(dtSeconds) {
  physics.stepFrame(world, dtSeconds);
  generateTailParticle(world.x, world.y);
  for (const event of physics.drainEvents(world)) {
    switch (event.type) {
      case 'brick':
        generateCollisionEffect(event.x, event.y);
        playBrickHitSound();
        vibrateDevice(15);
        hubScore(world.score);
        break;
      case 'paddle':
        generateCollisionEffect(event.x, canvas.height - world.paddleHeight);
        playPaddleHitSound();
        vibrateDevice(20);
        break;
      case 'wall':
        break;
      case 'cleared':
        playVictorySound();
        saveHighScore(world.score);
        hubFinish(world.score);
        gameState = 'menu';
        stopBackgroundMusic();
        showMessage('Победа!', () => { restartGame(); showMenu('startMenu'); });
        break;
      case 'lifeLost':
        showMessage(`Потеряна жизнь. Осталось: ${event.lives}`, () => { physics.serveBall(world, 0); lastFrameTime = 0; });
        break;
      case 'gameOver':
        playGameOverSound();
        saveHighScore(world.score);
        hubFinish(world.score);
        gameState = 'menu';
        stopBackgroundMusic();
        showMessage('Игра окончена', () => { restartGame(); showMenu('startMenu'); });
        break;
      default:
        break;
    }
  }
}

function frame(now) {
  if (gameState !== 'playing') return;
  if (!lastFrameTime) lastFrameTime = now;
  const dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  update(dt);
  render();
  if (gameState === 'playing') animationId = requestAnimationFrame(frame);
}

function startLoop() {
  if (animationId) cancelAnimationFrame(animationId);
  lastFrameTime = 0;
  animationId = requestAnimationFrame(frame);
}

function stopLoop() {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
  lastFrameTime = 0;
}

// ── Управление платформой ──────────────────────────────────────────────────
function clampPaddle() {
  world.paddleX = Math.max(0, Math.min(canvas.width - world.paddleWidth, world.paddleX));
}

function getTouchPosition(touch) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return 0;
  const scaleX = canvas.width / rect.width;
  return (touch.clientX - rect.left) * scaleX - world.paddleWidth / 2;
}

function mouseMoveHandler(e) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  world.paddleX = (e.clientX - rect.left) * (canvas.width / rect.width) - world.paddleWidth / 2;
  clampPaddle();
}

// Слушатель висит на canvas, а не на document: глобальный touchstart
// перехватывал свайп по меню хаба, и карточка под платформой не отвечала.
function touchMoveHandler(e) {
  const touch = e.touches[0];
  if (!touch) return;
  e.preventDefault();
  world.paddleX = getTouchPosition(touch);
  clampPaddle();
}

function touchStartHandler(e) {
  const touch = e.touches[0];
  if (!touch) return;
  world.paddleX = getTouchPosition(touch);
  clampPaddle();
}

// ── Рекорды ────────────────────────────────────────────────────────────────
let highScores = [];
try {
  highScores = JSON.parse(localStorage.getItem('starlightBreakerHighScores')) || [];
} catch { highScores = []; }

function saveHighScore(score) {
  highScores.push(score);
  highScores.sort((a, b) => b - a);
  highScores = highScores.slice(0, 10);
  try { localStorage.setItem('starlightBreakerHighScores', JSON.stringify(highScores)); } catch { /* private mode */ }
}

function displayHighScores() {
  const list = document.getElementById('highScoreList');
  if (!list) return;
  if (!highScores.length) {
    list.innerHTML = '<div class="score-item"><span>Пока пусто</span></div>';
    return;
  }
  list.innerHTML = highScores.map((score, index) => `
    <div class="score-item">
      <span class="score-rank">#${index + 1}</span>
      <span class="score-value">${score}</span>
    </div>`).join('');
}

// ── Меню и состояния ───────────────────────────────────────────────────────
function showMessage(message, callback) {
  const box = document.getElementById('messageBox');
  const text = document.getElementById('messageText');
  const button = document.getElementById('messageButton');
  if (!box || !text || !button) return;
  text.textContent = message;
  box.classList.remove('hidden');
  button.onclick = () => { box.classList.add('hidden'); if (callback) callback(); };
}

function showMenu(menuId) {
  document.querySelectorAll('.menu').forEach((menu) => {
    menu.classList.remove('active');
    menu.classList.add('hidden');
  });
  const target = document.getElementById(menuId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }
  const gameMenu = document.getElementById('gameMenu');
  if (gameMenu) {
    gameMenu.classList.remove('active');
    gameMenu.classList.add('hidden');
  }
}

function hideAllMenus() {
  document.querySelectorAll('.menu').forEach((menu) => {
    menu.classList.remove('active');
    menu.classList.add('hidden');
  });
  const gameMenu = document.getElementById('gameMenu');
  if (gameMenu) {
    gameMenu.classList.remove('hidden');
    gameMenu.classList.add('active');
  }
}

function startGame() {
  __hubDone = false;
  physics.resetWorld(world);
  physics.serveBall(world, 0);
  gameState = 'playing';
  playBackgroundMusic();
  hideAllMenus();
  startLoop();
}

function restartGame() {
  if (!world) buildWorld();
  startGame();
}

function pauseGame() {
  gameState = 'paused';
  stopLoop();
  showMenu('pauseMenu');
}

function resumeGame() {
  if (!world) buildWorld();
  gameState = 'playing';
  hideAllMenus();
  startLoop();
}

function backToMainMenu() {
  gameState = 'menu';
  stopBackgroundMusic();
  stopLoop();
  showMenu('startMenu');
}

function checkOrientation() {
  const warning = document.getElementById('orientationWarning');
  if (!warning) return;
  // Подсказка о повороте: игра вертикальная, но в WebView мессенджера
  // принудительный поворот ломает вёрстку хаба, поэтому подсказываем, а не
  // блокируем.
  const tooNarrow = window.innerHeight < 320 || window.innerWidth < 300;
  warning.classList.toggle('hidden', !tooNarrow);
}

function showTouchGuide() {
  const guide = document.getElementById('touchGuide');
  if (!guide) return;
  // Ключ и значение — как в исходной версии. Смена ключа показала бы гайд
  // заново всем, кто его уже видел.
  let seen = false;
  try { seen = localStorage.getItem('hasSeenTouchGuide') === 'true'; } catch { seen = true; }
  if (seen || !isMobile) return;
  guide.classList.remove('hidden');
  document.getElementById('touchGuideBtn').onclick = () => {
    guide.classList.add('hidden');
    try { localStorage.setItem('hasSeenTouchGuide', 'true'); } catch { /* private mode */ }
  };
}

// ── Инициализация ──────────────────────────────────────────────────────────
function init() {
  if (!canvas) return;
  buildWorld();
  // showMenu сам прячет gameMenu, поэтому дублировать инициализацию через
  // window.load и вызывать hideAllMenus здесь не нужно.
  showMenu('startMenu');
  checkOrientation();
  showTouchGuide();

  canvas.addEventListener('touchstart', touchStartHandler, { passive: true });
  canvas.addEventListener('touchmove', touchMoveHandler, { passive: false });
  canvas.addEventListener('mousemove', mouseMoveHandler);
  document.addEventListener('mousemove', mouseMoveHandler);

  const on = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  };
  on('startGameBtn', startGame);
  on('instructionsBtn', () => showMenu('instructionsMenu'));
  on('highScoreBtn', () => { displayHighScores(); showMenu('highScoreMenu'); });
  on('backToMenuBtn', () => showMenu('startMenu'));
  on('backToMenuFromScoresBtn', () => showMenu('startMenu'));
  on('clearScoresBtn', () => { highScores = []; try { localStorage.removeItem('starlightBreakerHighScores'); } catch { /* ignore */ } displayHighScores(); });
  on('pauseBtn', pauseGame);
  on('menuBtn', backToMainMenu);
  on('resumeBtn', resumeGame);
  on('restartBtn', restartGame);
  on('backToMainMenuBtn', backToMainMenu);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gameState === 'playing') pauseGame();
  });

  // Поворот экрана меняет доступную высоту, а значит и размер холста.
  // Ориентир приходит не всегда раньше rotate, поэтому пересчёт отложен.
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      resizeCanvas();
      checkOrientation();
    }, 100);
  });

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resizeCanvas();
      checkOrientation();
      if (gameState === 'menu' || gameState === 'paused') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }, 250);
  });

  // Вкладка ушла в фон: цикл надо остановить, иначе по возвращении придёт
  // огромный dt. stepFrame это переживает, но звук и фоновая музыка — нет.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'playing') pauseGame();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
