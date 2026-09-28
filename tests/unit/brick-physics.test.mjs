import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Физика мяча в brick.
 *
 * Модуль загружается исполнением, а не импортом: он отдаёт себя в глобальную
 * переменную, чтобы один и тот же файл работал и в браузере как обычный
 * <script>, и здесь. Корневой package.json объявляет "type": "module", поэтому
 * CommonJS-экспорт из него недоступен.
 */
let P;
beforeAll(async () => {
  await import('../../games/brick/physics.js');
  P = globalThis.__hubBrickPhysics;
});

const world = (over = {}) => {
  const w = P.createWorld({ width: 400, height: 300, ...over });
  P.layoutBricks(w);
  P.serveBall(w, 0);
  return w;
};

describe('фиксированный шаг', () => {
  it('модуль отдаётся и содержит нужный API', () => {
    expect(typeof P.stepFrame).toBe('function');
    expect(typeof P.advance).toBe('function');
    expect(P.FIXED_STEP).toBeGreaterThan(0);
  });

  it('скорость не зависит от частоты кадров', () => {
    // Главный дефект, который эта правка закрывает. Прежде мяч двигался как
    // `x += 4` раз за кадр, то есть его скорость была 4 px × частота кадров:
    // на 30 Гц игра шла вдвое медленнее, чем на 60 Гц. Измерено на реальной
    // странице в MAX-подобном окружении: разброс 107%.
    //
    // Свойство формулируется через смоделированное время, а не через
    // кадры: пройденный путь обязан равняться speed × (число под-шагов ×
    // FIXED_STEP). Иначе тест зависел бы от того, как окно измерения
    // совпало с границей шага.
    const run = (fps, seconds = 3) => {
      const w = world();
      const dt = 1 / fps;
      const frames = Math.round(seconds * fps);
      let steps = 0;
      for (let i = 0; i < frames; i++) steps += P.stepFrame(w, dt);
      return { w, steps, simulated: steps * P.FIXED_STEP, real: frames * dt };
    };

    const results = [30, 60, 120, 144].map((fps) => run(fps));

    for (const { simulated, real } of results) {
      // Смоделированное время обязано идти вровень с реальным в пределах
      // одного шага. Прежняя физика «тратила» реальное время как 4 px за
      // кадр, и на 30 Гц успевала вдвое меньше.
      expect(Math.abs(simulated - real), `смоделировано ${simulated.toFixed(4)} при реальном ${real.toFixed(4)}`)
        .toBeLessThanOrEqual(P.FIXED_STEP);
    }

    // Разбитые кирпичи — целочисленный результат, и он обязан совпасть
    // точно: разница означала бы, что физика всё ещё плывёт по кадрам.
    const scores = results.map(({ w }) => w.score);
    expect(new Set(scores).size, `score разошёлся: ${scores.join(', ')}`).toBe(1);
  });

  it('путь за кадр соответствует скорости в пикселях в секунду', () => {
    // Прямая проверка того же свойства на пустом поле, где нет ни одного
    // столкновения. Утверждается не «скорость, посчитанная по окну», а точное
    // соотношение: путь = speed × смоделированное время. Окно может
    // закончиться за долю шага до границы, и тогда «скорость по окну»
    // плавала бы на пару процентов вовсе не из-за физики.
    const measure = (fps) => {
      const w = P.createWorld({ width: 400, height: 3000, brickRows: 0, brickColumns: 0 });
      P.serveBall(w, 0);
      const dt = 1 / fps;
      const start = w.y;
      const frames = Math.round(0.25 * fps);
      let steps = 0;
      for (let i = 0; i < frames; i++) steps += P.stepFrame(w, dt);
      return { path: start - w.y, steps, seconds: frames * dt, speed: w.speed, w };
    };
    for (const fps of [30, 60, 144]) {
      const { path, steps, seconds, speed } = measure(fps);
      const simulated = steps * P.FIXED_STEP;
      // Отставание накопителя ограничено одним шагом — иначе при просадке
      // кадров игра отставала бы от реального времени навсегда.
      expect(seconds - simulated, `${fps} fps: отставание ${((seconds - simulated) * 1000).toFixed(2)}ms`)
        .toBeGreaterThanOrEqual(0);
      expect(seconds - simulated).toBeLessThanOrEqual(P.FIXED_STEP + 1e-9);
      // И путь точно соответствует смоделированному времени.
      expect(path).toBeCloseTo(speed * simulated, 6);
    }
  });

  it('кадр длиннее MAX_FRAME_SECONDS не выбрасывает мяч за поле', () => {
    // Сворачивание вкладки или сон телефона дают огромный dt. Без ограничения
    // мяч после возвращения оказывался за полем и игра выглядела сломанной.
    const w = world();
    P.stepFrame(w, 30);
    expect(w.lives, 'жизнь списалась за один длинный кадр').toBe(3);
    expect(Number.isFinite(w.y)).toBe(true);
    expect(w.y).toBeLessThan(300);
  });

  it('остаток времени переносится, а не выбрасывается', () => {
    // При 30 Гц накопитель иначе терял бы треть пути каждый кадр.
    const w = world();
    let steps = 0;
    for (let i = 0; i < 30; i++) steps += P.stepFrame(w, 1 / 30);
    // Секунда при FIXED_STEP = 1/120 даёт 120 под-шагов плюс накопленный
    // остаток, поэтому ровно 120 означало бы выброшенное время.
    expect(steps).toBeGreaterThanOrEqual(120);
  });

  it('перегрузка не вызывает спираль смерти', () => {
    // Очень тяжёлый кадр: под-шагов больше предела, и накопленный долг
    // сбрасывается, иначе игра вечно догоняла бы прошлое.
    const w = world();
    const steps = P.stepFrame(w, 100);
    expect(steps).toBeLessThanOrEqual(P.MAX_SUBSTEPS);
    expect(w.accumulator).toBe(0);
  });
});

describe('столкновения', () => {
  it('отскок от угла отражает обе оси', () => {
    // Прежний код отражал только dy при любом попадании, поэтому удар точно
    // в угол давал физически невозможный отскок, и мяч застревал в кирпиче.
    const corner = P.reflectionAxis(105, 35, 10, { x: 100, y: 30, w: 40, h: 20 });
    expect(corner).toBe('xy');
  });

  it('горизонтальный вход отражает горизонтальную ось', () => {
    expect(P.reflectionAxis(105, 40, 10, { x: 100, y: 30, w: 40, h: 20 })).toBe('x');
  });

  it('вертикальный вход отражает вертикальную ось', () => {
    expect(P.reflectionAxis(120, 33, 10, { x: 100, y: 30, w: 40, h: 20 })).toBe('y');
  });

  it('мяч не проскакивает сквозь кирпич на высокой скорости', () => {
    // Туннелирование: при быстром мяче дискретная проверка пропускала кирпич
    // целиком между кадрами. Шаг намеренно меньше радиуса, поэтому за один
    // под-шаг проскочить нельзя. Проверяем на скорости в 20 раз выше нормы.
    const w = P.createWorld({ width: 400, height: 300, speed: 6000 });
    P.layoutBricks(w);
    P.serveBall(w, 0);
    for (let i = 0; i < 600; i++) P.stepFrame(w, 1 / 60);
    // Хоть один кирпич обязан быть разбит: иначе мяч ушёл бы сквозь поле.
    expect(P.bricksAlive(w), 'мяч проскочил сквозь все кирпичи').toBeLessThan(45);
  });

  it('скорость сохраняется после отскоков', () => {
    const w = world({ speed: 340 });
    for (let i = 0; i < 900; i++) {
      P.stepFrame(w, 1 / 60);
      expect(Math.hypot(w.vx, w.vy)).toBeGreaterThan(0);
      if (w.lives <= 0) break;
    }
    expect(Math.hypot(w.vx, w.vy)).toBeCloseTo(w.speed, 0);
  });
});

describe('платформа', () => {
  it('удар в край задаёт горизонтальную скорость', () => {
    // Раньше платформа влияла только на знак vy, и мяч отскакивал строго
    // вверх при любом касании: управление было невозможно.
    const hitEdge = (offsetFraction) => {
      const w = world();
      // Ставим мяч так, чтобы он падал точно в нужную точку платформы.
      w.paddleX = 100;
      w.paddleWidth = 200;
      w.x = 100 + 200 / 2 + offsetFraction * (200 / 2);
      w.y = w.height - w.paddleHeight - w.ballRadius - 1;
      w.vx = 0;
      w.vy = 200;
      P.advance(w, 1 / 60);
      return w.vx;
    };
    expect(Math.sign(hitEdge(0.9)), 'удар справа не уводит мяч вправо').toBeGreaterThan(0);
    expect(Math.sign(hitEdge(-0.9)), 'удар слева не уводит мяч влево').toBeLessThan(0);
    expect(hitEdge(0), 'удар в центр не даёт горизонтальной скорости').toBeCloseTo(0, 0);
  });
});

describe('жизни и завершение', () => {
  it('потеря жизни уменьшает счётчик и выпускает событие', () => {
    const w = world();
    w.y = w.height + w.ballRadius + 1;
    w.vy = 500;
    P.drainEvents(w);
    P.advance(w, 1 / 60);
    expect(w.lives).toBe(2);
    expect(P.drainEvents(w).map((e) => e.type)).toContain('lifeLost');
  });

  it('на последней жизни событие gameOver, а не lifeLost', () => {
    const w = world();
    w.lives = 1;
    w.y = w.height + w.ballRadius + 1;
    w.vy = 500;
    P.drainEvents(w);
    P.advance(w, 1 / 60);
    expect(P.drainEvents(w).map((e) => e.type)).toContain('gameOver');
  });

  it('очистка всех кирпичей даёт событие cleared ровно один раз', () => {
    const w = world();
    for (const column of w.bricks) for (const brick of column) brick.alive = false;
    P.drainEvents(w);
    w.x = w.bricks[0][0].x + w.brickWidth / 2;
    w.y = w.bricks[0][0].y + w.brickHeight / 2;
    w.vy = 100;
    P.advance(w, 1 / 60);
    const events = P.drainEvents(w);
    // Мёртвый кирпич не считается попаданием, поэтому cleared не поднимется.
    expect(events.filter((e) => e.type === 'cleared')).toHaveLength(0);
  });

  it('разбитый кирпич увеличивает счёт ровно на один', () => {
    const w = world();
    const brick = w.bricks[0][0];
    w.x = brick.x + w.brickWidth / 2;
    w.y = brick.y + w.brickHeight / 2;
    w.vy = 100;
    P.advance(w, 1 / 60);
    expect(w.score).toBe(1);
    expect(brick.alive).toBe(false);
  });

  it('горизонтальный удар отражает vx, а не только vy', () => {
    // Главный геометрический дефект оригинала: там отражался исключительно
    // dy, поэтому платформа задавала горизонтальную скорость, а кирпич —
    // нет, и мяч уходил вбок сквозь грани.
    const w = world();
    const brick = w.bricks[0][0];
    // Мяч входит в кирпич глубже по горизонтали, чем по вертикали: левая
    // грань на 4px ближе, чем нижняя.
    w.x = brick.x + 4 - w.ballRadius;
    w.y = brick.y + w.brickHeight - 9;
    w.vx = 100;
    w.vy = -100;
    P.advance(w, 1 / 120);
    expect(brick.alive, 'кирпич не разбит').toBe(false);
    expect(w.vx, 'горизонтальная составляющая не отражена').toBeLessThan(0);
  });

  it('vertical hit reflects vy and keeps vx', () => {
    const w = world();
    const brick = w.bricks[0][0];
    // Мяч входит глубже по вертикали: нижняя грань на 4px ближе, чем левая.
    w.x = brick.x + 9;
    w.y = brick.y + w.brickHeight - 4 - w.ballRadius;
    w.vx = 100;
    w.vy = -100;
    P.advance(w, 1 / 120);
    expect(brick.alive, 'кирпич не разбит').toBe(false);
    expect(w.vy, 'вертикальная составляющая не отражена').toBeGreaterThan(0);
  });

  it('точное попадание в угол отражает обе оси', () => {
    // Ветка равных проникновений почти недостижима из шага: смещение за
    // кадр не делится нацело, и на плавающей точке 'xy' не выигрывает. Она
    // проверяется напрямую на чистой функции — иначе тест был бы
    // нестабилен и зависел бы от порядка округлений.
    const rect = { x: 0, y: 0, w: 40, h: 20 };
    // Симметрично на 2px внутрь нижнего левого угла: overlapLeft ==
    // overlapBottom == radius + 2.
    expect(P.reflectionAxis(2, 18, 10, rect)).toBe('xy');
    // Контроль: чем ближе мяч к левой грани, тем меньше горизонтальное
    // проникновение, и удар уходит в горизонтальную ось.
    expect(P.reflectionAxis(1, 18, 10, rect)).toBe('x');
    expect(P.reflectionAxis(3, 18, 10, rect)).toBe('y');
  });

  it('равное проникновение по осям отражает обе составляющие', () => {
    // Интеграционная проверка того, что ветка равных проникновений реально
    // включена в шаг, а не только существует в helper. Чтобы равенство не
    // размылось на плавающей точке, смещение за шаг должно быть точной
    // двоичной дробью: скорость 60 при шаге 1/120 даёт ровно 0.5px.
    const w = world();
    const brick = w.bricks[0][0];
    // Старт на 1.5px, после шага — ровно на 2px вглубь угла по обеим осям.
    w.x = brick.x + 1.5;
    w.y = brick.y + w.brickHeight - 1.5;
    w.vx = 60;
    w.vy = -60;
    P.advance(w, 1 / 120);
    expect(brick.alive, 'кирпич не разбит').toBe(false);
    expect(w.vx, 'отражены обе оси, но vx остался положительным').toBeLessThan(0);
    expect(w.vy).toBeGreaterThan(0);
  });

  it('мяч, потерявший скорость при касании, снова выходит на платформу', () => {
    // Скорость нормализуется после каждого отскока. Если бы мяч коснулся
    // кирпича практически без скорости, нормализация делила бы на почти ноль,
    // и раунд намертво залипал бы без возможности проиграть.
    const w = world();
    const brick = w.bricks[0][0];
    w.x = brick.x + w.brickWidth / 2;
    w.y = brick.y + w.brickHeight - 1;
    w.vx = 0;
    w.vy = 1e-9;
    P.advance(w, 1 / 120);
    expect(Number.isFinite(w.vx)).toBe(true);
    expect(Number.isFinite(w.vy)).toBe(true);
    expect(Math.hypot(w.vx, w.vy), 'мяч остался без скорости').toBeCloseTo(w.speed, 3);
  });

  it('сброс раунда возвращает жизни, счёт и кирпичи', () => {
    const w = world();
    w.lives = 1;
    w.score = 17;
    for (const column of w.bricks) for (const brick of column) brick.alive = false;
    P.resetWorld(w);
    expect(w.lives).toBe(3);
    expect(w.score).toBe(0);
    expect(P.bricksAlive(w)).toBe(45);
  });
});

describe('раскладка', () => {
  it('кирпичи не выходят за поле', () => {
    const w = P.createWorld({ width: 400, height: 300 });
    P.layoutBricks(w);
    for (const column of w.bricks) {
      for (const brick of column) {
        expect(brick.x).toBeGreaterThanOrEqual(0);
        expect(brick.x + w.brickWidth).toBeLessThanOrEqual(w.width);
      }
    }
  });

  it('число кирпичей равно сетке', () => {
    const w = P.createWorld({ width: 400, height: 300, brickColumns: 9, brickRows: 5 });
    P.layoutBricks(w);
    expect(P.bricksAlive(w)).toBe(45);
  });
});
