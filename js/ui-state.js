const MOSCOW_TZ = 'Europe/Moscow';

function moscowDateKey(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(Number(value));
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MOSCOW_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((p) => p.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function dailyHeroState(progress, today, anyDailyCompleted = false) {
  const completed = moscowDateKey(progress?.lastPlayed) === today;
  if (completed) return { completed: true, status: '✓ вызов выполнен', cta: 'Побить результат' };
  if (anyDailyCompleted) return { completed: false, status: 'серия уже сохранена', cta: 'Играть сейчас' };
  return { completed: false, status: 'новый шанс сегодня', cta: 'Играть сейчас' };
}

export function recordBadgeText(meta) {
  if (!meta?.newBest) return '';
  return Number(meta.plays) === 1 ? '✦ ПЕРВЫЙ РЕКОРД' : '✦ НОВЫЙ РЕКОРД';
}

export function dailyResultText(meta) {
  if (!meta?.dailyAdvanced) return '';
  const streak = Math.max(1, Number(meta.streak) || 1);
  return streak === 1 ? '✦ Серия началась · 1 день' : `✦ Серия продлена · ${streak} дн.`;
}

export function challengeResultState(duel, higherIsBetter = true) {
  if (!duel) return null;
  if (duel.tie) return { kind: 'tie', text: `НИЧЬЯ · цель ${duel.challenge}` };
  if (duel.won) return { kind: 'win', text: `ПОБЕДА · цель ${duel.challenge}` };
  const gap = Math.abs(Number(duel.challenge) - Number(duel.score));
  return {
    kind: 'lose',
    text: higherIsBetter ? `ДО ЦЕЛИ · +${gap}` : `ДО ЦЕЛИ · −${gap}`,
  };
}

export function challengeIntroText(challenge, higherIsBetter = true, unit = '') {
  const suffix = unit ? ` ${unit}` : '';
  return higherIsBetter
    ? `Цель челленджа: не меньше ${challenge}${suffix}`
    : `Цель челленджа: не больше ${challenge}${suffix}`;
}
