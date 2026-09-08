/** Единая календарная граница daily-режима: московские сутки. */
export function dailySeed(date = new Date(), timeZone = 'Europe/Moscow') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (!year || !month || !day) throw new Error('dailySeed: date parts unavailable');
  return `${year}-${month}-${day}`;
}
