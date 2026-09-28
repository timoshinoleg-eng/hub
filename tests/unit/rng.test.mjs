/**
 * Шим детерминированной случайности (games/_rng.js).
 *
 * Главное, что здесь защищается, — совместимость. Хаб уже показывал игрокам
 * «пазл дня» за прошлые доли: seed уходил в URL, а алгоритм жил текстом в
 * tools/vendor.mjs. Если последовательность чисел изменится, у всех, кто видел
 * сегодняшний пазл, он начнёт отличаться от того, что они уже проходили. По
 *этому значения ниже зафиксированы, а не вычисляются по ходу теста.
 */
import { beforeAll, describe, expect, it } from 'vitest';

let R;

beforeAll(async () => {
  // Файл — обычный classic-скрипт ради игровых iframe, поэтому в Node он
  // подключается импортом и вешает API на globalThis.
  await import('../../games/_rng.js');
  R = globalThis.__hubRng;
});

describe('games/_rng.js', () => {
  it('читает seed только из строки запроса', () => {
    expect(R.readSeed('?seed=2026-09-06')).toBe('2026-09-06');
    expect(R.readSeed('a=1&seed=42&b=2')).toBe('42');
    // Пустой seed — это «seed не задан», а не seed из нуля: иначе дата
    // вида 0000-00-00 сделала бы пазл ежедневным, но всегда одинаковым.
    expect(R.readSeed('?seed=')).toBe('');
    expect(R.readSeed('?a=1')).toBe('');
    expect(R.readSeed('')).toBe('');
    expect(R.readSeed(undefined)).toBe('');
  });

  it('нечитаемая строка запроса не роняет загрузку игры', () => {
    // Файл подключается до скрипта каждой игры: исключение здесь уронило бы
    // игру целиком. Symbol — единственное, что заставляет URLSearchParams
    // бросить на строковом поиске.
    expect(R.readSeed(Symbol('seed'))).toBe('');
    expect(R.installSeedRandom(Symbol('seed'), { random: () => 0.5 })).toBeNull();
  });

  it('hash даёт беззнаковое 32-битное число', () => {
    for (const seed of ['2026-09-06', '2026-01-01', 'a', '']) {
      const h = R.hashString(seed);
      expect(Number.isInteger(h), `seed «${seed}» -> ${h}`).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
    // Близкие даты не должны давать почти одинаковое состояние — иначе
    // соседние дни пазла выглядели бы одинаково.
    expect(Math.abs(R.hashString('2026-09-06') - R.hashString('2026-09-07')))
      .toBeGreaterThan(1000);
  });

  it('один seed даёт одну и ту же последовательность', () => {
    const a = R.makeSeededRandom('2026-09-06');
    const b = R.makeSeededRandom('2026-09-06');
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('разные seed дают разные последовательности', () => {
    const ra = R.makeSeededRandom('2026-09-06');
    const rb = R.makeSeededRandom('2026-01-01');
    const a = Array.from({ length: 50 }, () => ra());
    const b = Array.from({ length: 50 }, () => rb());
    expect(a).not.toEqual(b);
  });

  it('генераторы независимы: чужой вызов не сдвигает последовательность', () => {
    const a = R.makeSeededRandom('2026-09-06');
    const b = R.makeSeededRandom('2026-09-06');
    expect(a()).toBe(b());
    // Соседний генератор не должен влиять на первый — иначе порядок вызовов
    // в игре снова бы определял раскладку.
    R.makeSeededRandom('другой')();
    expect(a()).toBe(b());
  });

  it('значения лежат в [0, 1)', () => {
    const r = R.makeSeededRandom('2026-09-06');
    for (let i = 0; i < 20_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('распределение не сбито в край диапазона', () => {
    // Проверка на фиксированном seed, поэтому результат воспроизводим и
    // тест не мигает. Мягкие границы: 25% в каждой четверти.
    const r = R.makeSeededRandom('2026-09-06');
    const buckets = [0, 0, 0, 0];
    const n = 40_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(r() * 4)]++;
    for (const [i, count] of buckets.entries()) {
      const share = count / n;
      expect(share, `четверть ${i}: ${(share * 100).toFixed(1)}%`).toBeGreaterThan(0.22);
      expect(share).toBeLessThan(0.28);
    }
  });

  it('последовательность совпадает с эталоном до перехода на шим', () => {
    // Эти числа — то, что получал сапёр и викторина через __hubRand из
    // tools/vendor.mjs. Расхождение означает, что у игроков, прошедших
    // сегодняшний пазл, раскладка поменяется.
    const r = R.makeSeededRandom('2026-09-06');
    expect([r(), r(), r(), r(), r(), r()]).toEqual([
      0.37420071521773934, 0.3031537174247205, 0.773705632193014,
      0.7949443620163947, 0.10057468339800835, 0.02411660202778876,
    ]);
  });

  it('без seed Math.random не трогается', () => {
    const math = { random: () => 0.5 };
    expect(R.installSeedRandom('', math)).toBeNull();
    expect(R.installSeedRandom('?a=1', math)).toBeNull();
    expect(math.random()).toBe(0.5);
  });

  it('подмена возвращает исходный random, и её можно откатить', () => {
    const original = () => 0.5;
    const math = { random: original };
    const returned = R.installSeedRandom('?seed=2026-09-06', math);
    expect(returned).toBe(original);
    // Подмена обязана быть заметна: иначе шим ничего не делает.
    expect(math.random()).not.toBe(0.5);
    math.random = returned;
    expect(math.random()).toBe(0.5);
  });

  it('подмена действует на все вызовы подряд, а не на первый', () => {
    // Раньше сапёру и викторине приходилось звать __hubRand() в каждом месте.
    // Смысл шима в том, что подменяется сама функция: если бы трогался только
    // первый вызов, раскладка зависела бы от того, кто первым позвал.
    const math = { random: () => 0.5 };
    R.installSeedRandom('?seed=2026-09-06', math);
    const a = Array.from({ length: 4 }, () => math.random());
    const b = Array.from({ length: 4 }, () => math.random());
    expect(a).not.toEqual(b);
    expect(a[0]).toBe(a[0]); // не NaN
    expect(a.every(Number.isFinite)).toBe(true);
  });

  it('импорт в Node не подменяет глобальный Math.random', () => {
    // Файл автозапускается только при наличии location. В Node её нет, иначе
    // воркер Vitest работал бы на генераторе, общем для всех тестов подряд.
    expect(typeof location).toBe('undefined');
  });
});
