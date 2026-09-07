/**
 * Шаринг-карточка. Рисуется на canvas — ни одного изображения в сборке,
 * значит и никаких лицензионных рисков по ассетам.
 *
 * Карточка нужна не ради красоты: в MAX нет каталога мини-приложений,
 * поэтому результат игры — единственный повод показать хаб другому человеку.
 */

const W = 900;
const H = 900;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawCard({ title, emoji, score, unit, hubName = 'Игротека' }) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');

  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#1b2a4a');
  g.addColorStop(1, '#3a1f52');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  x.textAlign = 'center';

  x.font = '700 34px system-ui, sans-serif';
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.fillText(hubName.toUpperCase(), W / 2, 110);

  x.font = '120px system-ui, "Segoe UI Emoji", sans-serif';
  x.fillText(emoji || '🎮', W / 2, 300);

  x.font = '700 56px system-ui, sans-serif';
  x.fillStyle = '#fff';
  x.fillText(title, W / 2, 400);

  x.font = '800 150px system-ui, sans-serif';
  x.fillStyle = '#ffd54a';
  x.fillText(String(score ?? 0), W / 2, 560);

  if (unit) {
    x.font = '500 34px system-ui, sans-serif';
    x.fillStyle = 'rgba(255,255,255,.7)';
    x.fillText(unit, W / 2, 615);
  }

  x.fillStyle = 'rgba(255,255,255,.1)';
  roundRect(x, 130, 700, W - 260, 90, 45);
  x.fill();

  x.font = '600 34px system-ui, sans-serif';
  x.fillStyle = '#fff';
  x.fillText('Сможешь больше?', W / 2, 758);

  return c;
}

export function cardDataUrl(opts) {
  return drawCard(opts).toDataURL('image/png');
}

/** Текст для шаринга: число + призыв + deep link. */
export function shareText({ title, score, unit, link }) {
  const s = score == null ? '' : ` — ${score}${unit ? ' ' + unit : ''}`;
  return link ? `Я играю в «${title}»${s}. Попробуй меня обогнать 👇\n${link}` : `Я играю в «${title}»${s}.`;
}
