/**
 * Манифест игр. Единственное место, где описывается игра:
 * всё остальное (меню, роутинг, шаринг, аналитика) читает отсюда.
 *
 * enabled: false — игра перенесена, но ещё не портирована (нет тач-управления
 * и русского текста). Показывается только с ?all=1.
 */
export const GAMES = [
  {
    id: 'merge',
    title: 'Мердж',
    tagline: 'Сдвигай плитки, собирай числа',
    emoji: '🔢',
    enabled: true,
    unit: 'очков',
    cfg: {
      scoreSelector: '#score',
      finishSelector: '#result',
      preventScroll: true,
    },
  },
  {
    id: 'reaction',
    title: 'Реакция',
    tagline: '30 секунд. Бей сколько успеешь',
    emoji: '⚡',
    enabled: true,
    unit: 'попаданий',
    cfg: {
      scoreSelector: '.score',
      preventScroll: true,
    },
  },
  {
    id: 'snake',
    title: 'Змейка',
    tagline: 'Классика. Свайпы вместо кнопок',
    emoji: '🐍',
    enabled: true,
    unit: 'очков',
    cfg: {
      scoreSelector: '.score',
      preventScroll: true,
    },
  },

  // ── Перенесены и портированы ──────────────────────────────────────────────
  {
    id: 'sapper',
    title: 'Сапёр',
    tagline: 'Тап — открыть, кнопка «флаг» — пометить',
    emoji: '💣',
    enabled: true,
    unit: 'очков',
    cfg: {
      preventContextMenu: true,
      preventScroll: true,
      daily: true,
    },
  },
  {
    id: 'quiz',
    title: 'Викторина',
    tagline: '20 вопросов на эрудицию',
    emoji: '❓',
    enabled: true,
    unit: 'правильных',
    cfg: {
      preventScroll: true,
      daily: true,
    },
  },
  {
    id: 'echo',
    title: 'Эхо',
    tagline: 'Повтори последовательность',
    emoji: '🔔',
    enabled: true,
    unit: 'уровней',
    cfg: {
      preventScroll: true,
    },
  },
  {
    id: 'memory',
    title: 'Память',
    tagline: 'Найди восемь пар',
    emoji: '🧠',
    enabled: true,
    unit: 'ходов',
    cfg: {
      preventScroll: true,
      higherIsBetter: false,
    },
  },
];

export const byId = (id) => GAMES.find((g) => g.id === id);
export const visible = (showAll) => GAMES.filter((g) => showAll || g.enabled);
