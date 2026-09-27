import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dailySeed } from '../../js/daily.js';
import { isBetterScore, nextDailyStreak, readProgress, recordFinish, getSummary } from '../../js/progress.js';
import { duelResult } from '../../js/duel.js';
import { isQuizzzzStartParam, quizzzzLaunchUrl } from '../../js/quizzzz-routing.js';
import {
  challengeIntroText, challengeResultState, dailyHeroState, dailyResultText, recordBadgeText,
} from '../../js/ui-state.js';
import { observeVisit } from '../../js/engagement.js';

/** Минимальная подмена localStorage в памяти. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    get size() { return map.size; },
    raw: map,
  };
}

let store;
beforeEach(() => {
  store = memoryStorage();
  vi.stubGlobal('localStorage', store);
});
afterEach(() => vi.unstubAllGlobals());

describe('dailySeed', () => {
  it('одинаков для всего московского дня', () => {
    // 21:00 UTC = 00:00 следующего дня по Москве.
    expect(dailySeed(new Date('2026-09-09T20:59:00Z'))).toBe('2026-09-09');
    expect(dailySeed(new Date('2026-09-09T21:00:00Z'))).toBe('2026-09-10');
  });

  it('формат YYYY-MM-DD', () => {
    expect(dailySeed(new Date('2026-01-05T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('не зависит от часового пояса машины', () => {
    // Один и тот же момент в UTC даёт один и тот же московский день.
    const t = new Date('2026-06-15T23:30:00Z');
    const first = dailySeed(t);
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(dailySeed(t)).toBe(first);
    } finally {
      if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
    }
  });
});

describe('progress', () => {
  it('первый результат всегда становится рекордом', () => {
    expect(isBetterScore(10, null)).toBe(true);
  });

  it('учитывает направление метрики', () => {
    expect(isBetterScore(10, 5, true)).toBe(true);
    expect(isBetterScore(10, 5, false)).toBe(false);
    expect(isBetterScore(3, 5, false)).toBe(true);
  });

  it('не принимает нечисловой счёт', () => {
    expect(isBetterScore(NaN, 1)).toBe(false);
    expect(isBetterScore(Infinity, 1)).toBe(false);
  });

  it('серия растёт только за следующий день', () => {
    expect(nextDailyStreak('2026-09-09', 3, '2026-09-10')).toBe(4);
    expect(nextDailyStreak('2026-09-09', 3, '2026-09-09')).toBe(3);
    // Пропуск дня обнуляет серию, а не продолжает её.
    expect(nextDailyStreak('2026-09-08', 3, '2026-09-10')).toBe(1);
    expect(nextDailyStreak(null, 3, '2026-09-10')).toBe(1);
  });

  it('recordFinish пишет прогресс и считает рекорд', () => {
    const game = { id: 'merge', cfg: { higherIsBetter: true } };
    const r1 = recordFinish(game, 100, '2026-09-09');
    expect(r1).toMatchObject({ newBest: true, best: 100, plays: 1 });
    const r2 = recordFinish(game, 50, '2026-09-09');
    expect(r2).toMatchObject({ newBest: false, best: 100, plays: 2 });
    const r3 = recordFinish(game, 150, '2026-09-09');
    expect(r3).toMatchObject({ newBest: true, best: 150, plays: 3 });
  });

  it('для lower-is-better рекорд уменьшается', () => {
    const game = { id: 'memory', cfg: { higherIsBetter: false } };
    recordFinish(game, 20, '2026-09-09');
    const better = recordFinish(game, 15, '2026-09-09');
    expect(better).toMatchObject({ newBest: true, best: 15 });
  });

  it('серия продвигается только у daily-игр', () => {
    const plain = { id: 'merge', cfg: {} };
    const daily = { id: 'sapper', cfg: { daily: true } };
    expect(recordFinish(plain, 10, '2026-09-09').dailyAdvanced).toBe(false);
    expect(recordFinish(daily, 10, '2026-09-09').dailyAdvanced).toBe(true);
  });

  it('повторный финиш в тот же день не удваивает серию', () => {
    const daily = { id: 'sapper', cfg: { daily: true } };
    recordFinish(daily, 10, '2026-09-09');
    const again = recordFinish(daily, 20, '2026-09-09');
    expect(again.dailyAdvanced).toBe(false);
    expect(again.streak).toBe(1);
  });

  it('битое хранилище не ломает чтение', () => {
    store.setItem('hub_progress_v1', '{not json');
    expect(readProgress()).toEqual({ games: {}, daily: { lastDate: null, streak: 0 } });
  });

  it('summary отражает накопленное', () => {
    const daily = { id: 'sapper', cfg: { daily: true } };
    recordFinish(daily, 10, '2026-09-09');
    const s = getSummary('2026-09-09');
    expect(s.finishes).toBe(1);
    expect(s.records).toBe(1);
    expect(s.streak).toBe(1);
    expect(s.completedToday).toBe(true);
  });
});

describe('duelResult', () => {
  it('ничья считается победой в протоколе', () => {
    // Это зафиксированное поведение, а не ошибка: duels считаются «не хуже».
    // Именно поэтому текст результата берётся из ui-state, который ничью
    // показывает отдельно, иначе игрок читал бы «победа» при равенстве.
    expect(duelResult(10, 10)).toMatchObject({ tie: true, won: true });
  });

  it('учитывает направление метрики', () => {
    expect(duelResult(12, 10, true)).toMatchObject({ won: true, tie: false });
    expect(duelResult(8, 10, true)).toMatchObject({ won: false });
    expect(duelResult(8, 10, false)).toMatchObject({ won: true });
  });

  it('без челленджа результата нет', () => {
    expect(duelResult(10, null)).toBeNull();
  });
});

describe('ui-state', () => {
  it('различает «сегодняшний hero сыгран» и «серия уже сохранена»', () => {
    const today = '2026-09-09';
    // lastPlayed за сегодняшнюю московскую дату
    const playedToday = Date.parse('2026-09-09T12:00:00Z');
    expect(dailyHeroState({ lastPlayed: playedToday }, today, false).completed).toBe(true);
    // Другая daily-игра сохранила серию, но hero не сыгран.
    expect(dailyHeroState({ lastPlayed: Date.parse('2026-09-08T12:00:00Z') }, today, true))
      .toMatchObject({ completed: false, status: 'серия уже сохранена' });
  });

  it('битый lastPlayed не ломает расчёт', () => {
    expect(dailyHeroState({}, '2026-09-09', false).cta).toBe('Играть сейчас');
    expect(dailyHeroState({ lastPlayed: 'мусор' }, '2026-09-09', false).completed).toBe(false);
  });

  it('первый рекорд отличается от улучшения', () => {
    expect(recordBadgeText({ newBest: true, plays: 1 })).toBe('✦ ПЕРВЫЙ РЕКОРД');
    expect(recordBadgeText({ newBest: true, plays: 2 })).toBe('✦ НОВЫЙ РЕКОРД');
    expect(recordBadgeText({ newBest: false, plays: 3 })).toBe('');
  });

  it('состояние челленджа различает ничью', () => {
    expect(challengeResultState({ tie: true, won: true, score: 10, challenge: 10 }).kind).toBe('tie');
    expect(challengeResultState({ tie: false, won: true, score: 12, challenge: 10 }).kind).toBe('win');
    expect(challengeResultState({ tie: false, won: false, score: 7, challenge: 10 })).toMatchObject({ kind: 'lose', text: 'ДО ЦЕЛИ · +3' });
  });

  it('пробел до цели со знаком, заданным направлением метрики', () => {
    expect(challengeResultState({ tie: false, won: false, score: 14, challenge: 10 }, false).text).toContain('−');
  });

  it('без челленджа блока нет', () => {
    expect(challengeResultState(null)).toBeNull();
  });

  it('текст интро учитывает направление и единицы', () => {
    expect(challengeIntroText(25, true, 'очков')).toBe('Цель челленджа: не меньше 25 очков');
    expect(challengeIntroText(12, false)).toBe('Цель челленджа: не больше 12');
  });

  it('текст серии корректен на единицах', () => {
    expect(dailyResultText({ dailyAdvanced: true, streak: 1 })).toContain('1 день');
    expect(dailyResultText({ dailyAdvanced: true, streak: 4 })).toContain('4 дн.');
    expect(dailyResultText({ dailyAdvanced: false, streak: 4 })).toBe('');
  });
});

describe('launch-router', () => {
  it('принимает только известные намерения Quizzzz', () => {
    for (const p of ['daily', 'league', 'leaderboard', 'challenge_new', 'd_abcDEF_123', 'challenge_ABCD']) {
      expect(isQuizzzzStartParam(p), p).toBe(true);
    }
  });

  it('не перехватывает аркадные ссылки хаба', () => {
    for (const p of ['', 'gmerge', 'gmerge_s100', 'unknown', 'd bad', 'x'.repeat(513)]) {
      expect(isQuizzzzStartParam(p), p || '(empty)').toBe(false);
    }
  });

  it('не принимает опасные символы', () => {
    for (const p of ['../etc', 'daily/../x', 'javascript:alert(1)', 'a=b']) {
      expect(isQuizzzzStartParam(p), p).toBe(false);
    }
  });

  it('строит целевой URL с сохранением намерения', () => {
    const url = new URL(quizzzzLaunchUrl('daily', 'https://hub.example'));
    expect(url.pathname).toBe('/quiz/');
    expect(url.searchParams.get('startapp')).toBe('daily');
    expect(url.searchParams.get('from')).toBe('hub');
  });

  it('для нераспознанного намерения URL пуст', () => {
    expect(quizzzzLaunchUrl('gmerge', 'https://hub.example')).toBe('');
  });
});

describe('engagement', () => {
  it('первый визит распознаётся', () => {
    expect(observeVisit('2026-09-09')).toMatchObject({ firstVisit: true, returning: false });
  });

  it('повтор в тот же день не считается возвратом', () => {
    observeVisit('2026-09-09');
    expect(observeVisit('2026-09-09')).toMatchObject({ firstVisit: false, returning: false });
  });

  it('возврат фиксирует разрыв в днях', () => {
    observeVisit('2026-09-09');
    expect(observeVisit('2026-09-10')).toMatchObject({ returning: true, daysAway: 1 });
  });

  it('битое состояние хранилища трактуется как первый визит', () => {
    store.setItem('hub_visit_v1', '{{{');
    expect(observeVisit('2026-09-09').firstVisit).toBe(true);
  });

  it('при недоступном хранилище не падает', () => {
    vi.stubGlobal('localStorage', null);
    expect(observeVisit('2026-09-09')).toMatchObject({ firstVisit: false, returning: false });
  });

  it('в хранилище не попадает идентичность', () => {
    observeVisit('2026-09-09');
    const raw = JSON.stringify([...store.raw.entries()]);
    expect(raw).not.toContain('user');
    expect(raw).not.toContain('initData');
    expect(Object.keys(JSON.parse(store.getItem('hub_visit_v1')))).toEqual(['lastDate']);
  });
});
