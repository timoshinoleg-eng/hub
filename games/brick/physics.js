/**
 * Физика мяча — чистый модуль, без DOM и без canvas.
 *
 * Зачем вынесено отдельно. Раньше физика жила внутри функции draw(), которая
 * одновременно считала кадр, двигала мяч и планировала следующий кадр, поэтому
 * её нельзя было ни протестировать, ни исправить: любая проверка требовала бы
 * браузера. Здесь только числа — значит, тесты исполняют модуль напрямую.
 *
 * Что не так было и что здесь сделано иначе.
 *
 * 1. Скорость не зависела от времени. Мяч двигался как `x += 4` один раз за
 *    кадр, то есть его скорость была 4 px × частота кадров. На 60 Гц это
 *    240 px/с, на 30 Гц — вдвое медленнее. В MAX WebView на горящем телефоне
 *    частота кадров проседает, и игра реально тормозила. Теперь скорость
 *    задана в px/с, а интегрирование идёт фиксированным шагом с накопителем.
 *
 * 2. Туннелирование. При быстром мяче дискретная проверка пересечения
 *    пропускала кирпич целиком между кадрами. Шаг намеренно меньше радиуса
 *    мяча, поэтому за один под-шаг мяч не может проскочить сквозь кирпич.
 *
 * 3. Отскок от угла. Раньше при пересечении кирпича отражался только dy, и
 *    удар точно в угол давал физически невозможный отскок. Теперь ось
 *    отражения выбирается по минимальному проникновению.
 *
 * 4. Платформа не влияла на траекторию. Удар в край платформы теперь задаёт
 *    горизонтальную скорость, и мяч уходит вбок, а не строго вверх.
 *
 */
(function (global) {
'use strict';

/** Фиксированный шаг интегрирования, секунды. 120 Гц хватает для 4:3 поля. */
const FIXED_STEP = 1 / 120;
/**
 * Кадр длиннее этого считается аномалией — вкладка сворачивалась, телефон
 * уходил в сон, или WebView отдал управление другому приложению. Без
 * ограничения мяч после сворачивания телефона улетал за поле.
 */
const MAX_FRAME_SECONDS = 0.25;

/** Больше этого числа под-шагов за кадр считаем перегрузкой и не догоняем. */
const MAX_SUBSTEPS = 16;

/**
 * Остаток времени, не использованный шагами: держим, а не выбрасываем.
 *
 * Геометрия кирпичей и ширина платформы выводятся из размера поля, если их не
 * задали явно: иначе мир можно собрать с сеткой, которая не помещается в
 * холст, и мяч будет пролетать мимо кирпичей.
 */
function createWorld(options) {
  const {
    width,
    height,
    ballRadius = 10,
    speed = 320,
    brickColumns = 9,
    brickRows = 5,
    brickPadding = 8,
  } = options;

  const geometry = computeGeometry({ width, height, brickColumns, brickPadding });
  const paddleWidth = options.paddleWidth ?? Math.max(48, Math.round(width * 0.22));
  const paddleHeight = options.paddleHeight ?? 12;

  return {
    width,
    height,
    ballRadius,
    speed,
    paddleWidth,
    paddleHeight,
    brickColumns,
    brickRows,
    ...geometry,

    x: width / 2,
    y: height - Math.max(24, Math.round(height * 0.1)),
    vx: 0,
    vy: 0,
    paddleX: (width - paddleWidth) / 2,

    // Кирпичи: bricks[c][r].alive. Порядок [колонка][строка] — как в оригинале,
    // чтобы отрисовка не поменялась.
    bricks: [],
    lives: 3,
    score: 0,
    // Накопитель времени для фиксированного шага.
    accumulator: 0,
    // События текущего кадра; оболочка их разбирает и превращает в звук,
    // вибрацию и частицы.
    events: [],
  };
}

/** Раскладывает кирпичи по сетке с учётом размера поля. */
function layoutBricks(world) {
  world.bricks = [];
  for (let c = 0; c < world.brickColumns; c++) {
    const column = [];
    for (let r = 0; r < world.brickRows; r++) {
      column.push({
        x: world.brickOffsetLeft + c * (world.brickWidth + world.brickPadding),
        y: world.brickOffsetTop + r * (world.brickHeight + world.brickPadding),
        alive: true,
      });
    }
    world.bricks.push(column);
  }
  return world;
}

/**
 * Ставит мяч на стартовую позицию и задаёт направление под углом к вертикали.
 * Угол задаётся долей, а не градусами: 0 — строго вверх, ±0.35 — вбок.
 */
/**
 * Геометрия кирпичей выводится из размера поля, а не задаётся константами.
 *
 * Раньше размеры приходили из отрисовки и подгонялись под canvas: кирпич
 * шириной 75px при поле 800px — это нормально, но при поле 350px, то есть на
 * узком телефоне, стена из девяти кирпичей занимала 785px и уезжала за край.
 * Здесь сетка всегда помещается в поле при любом размере холста.
 */
function computeGeometry({ width, height, brickColumns, brickPadding = 8 }) {
  const side = Math.max(6, Math.round(width * 0.04));
  const usable = Math.max(1, width - side * 2);
  const brickWidth = (usable - brickPadding * (brickColumns - 1)) / brickColumns;
  const brickHeight = Math.max(8, Math.round(brickWidth * 0.26));
  return {
    brickWidth,
    brickHeight,
    brickPadding,
    brickOffsetLeft: side,
    brickOffsetTop: Math.max(12, Math.round(height * 0.1)),
  };
}

function serveBall(world, dirX = 0) {
  world.x = world.width / 2;
  world.y = world.height - Math.max(24, Math.round(world.height * 0.1));
  world.accumulator = 0;
  const vx = world.speed * dirX;
  const vy = -Math.sqrt(Math.max(0, world.speed * world.speed - vx * vx));
  world.vx = vx;
  world.vy = vy;
  return world;
}

function emit(world, type, data) {
  world.events.push({ type, ...data });
  return world;
}

/** Количество живых кирпичей. */
function bricksAlive(world) {
  let n = 0;
  for (const column of world.bricks) for (const brick of column) if (brick.alive) n++;
  return n;
}

/** Перезапуск раунда: три жизни, все кирпичи на месте. */
function resetWorld(world) {
  world.lives = 3;
  world.score = 0;
  world.accumulator = 0;
  for (const column of world.bricks) for (const brick of column) brick.alive = true;
  return world;
}

/** Держит скорость постоянной: отражения меняют направление, но не модуль. */
function normaliseSpeed(world) {
  const current = Math.hypot(world.vx, world.vy);
  if (current < 1e-6) {
    serveBall(world, 0);
    return;
  }
  const factor = world.speed / current;
  world.vx *= factor;
  world.vy *= factor;
}

/**
 * Отражение по оси минимального проникновения.
 *
 * Возвращает 'x', 'y' или 'xy'. Ось определяется тем, насколько глубоко мяч
 * вошёл в прямоугольник: если мяч зашёл больше по горизонтали, отражать надо
 * горизонтальную составляющую. Прежний код всегда отражал dy, из-за чего удар
 * в угол давал отскок внутрь кирпича и мяч застревал.
 */
function reflectionAxis(ballX, ballY, radius, rect) {
  const overlapLeft = ballX + radius - rect.x;
  const overlapRight = rect.x + rect.w - (ballX - radius);
  const overlapTop = ballY + radius - rect.y;
  const overlapBottom = rect.y + rect.h - (ballY - radius);
  const minX = Math.min(overlapLeft, overlapRight);
  const minY = Math.min(overlapTop, overlapBottom);
  if (minX < minY) return 'x';
  if (minY < minX) return 'y';
  // Точное попадание в угол: отражаем обе оси, иначе мяч скользит вдоль грани.
  return 'xy';
}

/** Кирпич под мячом с минимальным проникновением, либо null. */
function hitBrick(world) {
  const r = world.ballRadius;
  let best = null;
  let bestOverlap = Infinity;
  for (const column of world.bricks) {
    for (const brick of column) {
      if (!brick.alive) continue;
      if (world.x + r <= brick.x || world.x - r >= brick.x + world.brickWidth) continue;
      if (world.y + r <= brick.y || world.y - r >= brick.y + world.brickHeight) continue;
      const axis = reflectionAxis(world.x, world.y, r, {
        x: brick.x, y: brick.y, w: world.brickWidth, h: world.brickHeight,
      });
      const overlap = axis === 'x'
        ? Math.min(world.x + r - brick.x, brick.x + world.brickWidth - (world.x - r))
        : Math.min(world.y + r - brick.y, brick.y + world.brickHeight - (world.y - r));
      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        best = { brick, axis };
      }
    }
  }
  return best;
}

/**
 * Один фиксированный шаг физики.
 *
 * Шаг намеренно меньше радиуса мяча: за один шаг мяч не может целиком пересечь
 * кирпич, поэтому дискретной проверки достаточно и туннелирования не будет.
 * Возвращает false, если жизнь потеряна и продолжать нечего.
 */
function advance(world, h) {
  const r = world.ballRadius;

  world.x += world.vx * h;
  world.y += world.vy * h;

  // Стенки.
  if (world.x - r < 0) { world.x = r; world.vx = Math.abs(world.vx); emit(world, 'wall'); }
  else if (world.x + r > world.width) { world.x = world.width - r; world.vx = -Math.abs(world.vx); emit(world, 'wall'); }
  if (world.y - r < 0) { world.y = r; world.vy = Math.abs(world.vy); emit(world, 'wall'); }

  // Кирпичи.
  const hit = hitBrick(world);
  if (hit) {
    hit.brick.alive = false;
    world.score += 1;
    if (hit.axis === 'x') world.vx = -world.vx;
    else if (hit.axis === 'y') world.vy = -world.vy;
    else { world.vx = -world.vx; world.vy = -world.vy; }
    normaliseSpeed(world);
    emit(world, 'brick', {
      x: hit.brick.x + world.brickWidth / 2,
      y: hit.brick.y + world.brickHeight / 2,
      score: world.score,
    });
    if (bricksAlive(world) === 0) emit(world, 'cleared', { score: world.score });
    return true;
  }

  // Платформа.
  const paddleTop = world.height - world.paddleHeight;
  if (world.vy > 0 && world.y + r >= paddleTop && world.y - r <= world.height) {
    const inPaddle = world.x >= world.paddleX && world.x <= world.paddleX + world.paddleWidth;
    if (inPaddle) {
      world.y = paddleTop - r;
      world.vy = -Math.abs(world.vy);
      // Удар в край задаёт горизонтальную скорость: |смещение| / половина
      // платформы, ограниченное половиной общей скорости. Иначе мяч отскакивал
      // строго вверх при любом касании и игра теряла управление.
      const centre = world.paddleX + world.paddleWidth / 2;
      const half = world.paddleWidth / 2;
      const offset = half > 0 ? (world.x - centre) / half : 0;
      const horizontal = world.speed * 0.62 * Math.max(-1, Math.min(1, offset));
      world.vx = horizontal;
      normaliseSpeed(world);
      emit(world, 'paddle', { x: world.x, offset });
      return true;
    }
  }

  // Пол.
  if (world.y - r > world.height) {
    world.lives -= 1;
    if (world.lives > 0) {
      emit(world, 'lifeLost', { lives: world.lives });
      return true;
    }
    emit(world, 'gameOver', { score: world.score });
    return false;
  }

  return true;
}

/**
 * Продвигает мир на реальный прошедший кадр.
 *
 * Накопитель обязателен: шаг фиксированный, а кадры приходят нерегулярно.
 * Без него скорость снова зависила бы от частоты кадров, только выборочно.
 * Остаток не выбрасывается, а переносится в следующий кадр, иначе на 30 Гц
 * мяч систематически терял бы треть пути.
 *
 * Возвращает число выполненных под-шагов — это же значение используется как
 * индикатор того, что кадр был тяжёлым.
 */
function stepFrame(world, dtSeconds) {
  const dt = Math.min(Math.max(dtSeconds || 0, 0), MAX_FRAME_SECONDS);
  world.accumulator += dt;
  let steps = 0;
  while (world.accumulator >= FIXED_STEP) {
    world.accumulator -= FIXED_STEP;
    steps += 1;
    if (!advance(world, FIXED_STEP)) break;
    if (steps >= MAX_SUBSTEPS) {
      // Кадр не догнан: телефон не успевает. Не копим долг, иначе игра
      // уйдёт в спираль смерти и продолжит догонять уже в следующем кадре.
      world.accumulator = 0;
      break;
    }
  }
  return steps;
}

function drainEvents(world) {
  if (!world.events.length) return [];
  const out = world.events;
  world.events = [];
  return out;
}

const api = {
  FIXED_STEP,
  MAX_FRAME_SECONDS,
  MAX_SUBSTEPS,
  createWorld,
  layoutBricks,
  serveBall,
  resetWorld,
  bricksAlive,
  advance,
  stepFrame,
  drainEvents,
  reflectionAxis,
};

/**
 * Модуль отдаёт себя в глобальную переменную, а не через export.
 *
 * Так сделано потому, что один и тот же файл должен загружаться и браузером
 * как обычный <script> перед game.js, и Node-тестом. CommonJS-экспорт здесь не
 * работает: корневой package.json объявляет "type": "module", поэтому require()
 * трактует файл как ESM. Глобальная переменная одинаково работает в обоих
 * случаях, а порядок загрузки в браузере остаётся явным.
 */
global.__hubBrickPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
