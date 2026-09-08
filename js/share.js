/** Результат для шаринга: canvas без внешних изображений и системных emoji. */
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

function drawBrandMark(ctx, cx, cy, size, accent, accent2) {
  const g = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
  g.addColorStop(0, accent || '#7568ff');
  g.addColorStop(1, accent2 || '#4ce3e8');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * .28, -size * .28);
  ctx.lineTo(size, 0);
  ctx.lineTo(size * .28, size * .28);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * .28, size * .28);
  ctx.lineTo(-size, 0);
  ctx.lineTo(-size * .28, -size * .28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawCard({
  title, score, unit, hubName = 'Игротека', accent = '#7568ff', accent2 = '#4ce3e8',
}) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');

  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#11182a');
  bg.addColorStop(1, '#17101f');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  x.globalAlpha = .16;
  x.fillStyle = accent;
  x.beginPath();
  x.arc(760, 90, 260, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = accent2;
  x.beginPath();
  x.arc(80, 760, 250, 0, Math.PI * 2);
  x.fill();
  x.globalAlpha = 1;

  x.textAlign = 'center';
  x.font = '700 34px system-ui, sans-serif';
  x.fillStyle = 'rgba(255,255,255,.58)';
  x.fillText(hubName.toUpperCase(), W / 2, 110);

  drawBrandMark(x, W / 2, 255, 72, accent, accent2);

  x.font = '700 56px system-ui, sans-serif';
  x.fillStyle = '#fff';
  x.fillText(title, W / 2, 405);

  x.font = '800 150px system-ui, sans-serif';
  x.fillStyle = '#fff';
  x.fillText(String(score ?? 0), W / 2, 570);

  if (unit) {
    x.font = '500 34px system-ui, sans-serif';
    x.fillStyle = 'rgba(255,255,255,.7)';
    x.fillText(unit, W / 2, 625);
  }

  x.fillStyle = 'rgba(255,255,255,.09)';
  roundRect(x, 130, 700, W - 260, 90, 45);
  x.fill();

  x.font = '600 34px system-ui, sans-serif';
  x.fillStyle = '#fff';
  x.fillText('Сможешь побить мой результат?', W / 2, 758);

  return c;
}

export function cardDataUrl(opts) {
  return drawCard(opts).toDataURL('image/png');
}

/** Текст для шаринга: число + призыв + deep link. */
export function shareText({ title, score, unit, link }) {
  const s = score == null ? '' : ` — ${score}${unit ? ' ' + unit : ''}`;
  return link
    ? `Я играю в «${title}»${s}. Попробуй меня обогнать.\n${link}`
    : `Я играю в «${title}»${s}.`;
}
