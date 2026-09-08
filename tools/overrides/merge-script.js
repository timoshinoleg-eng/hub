function __mergeLine(line) {
  const compact = line.filter((n) => n !== 0);
  const merged = [];
  let gained = 0;
  for (let i = 0; i < compact.length; i++) {
    if (i + 1 < compact.length && compact[i] === compact[i + 1]) {
      const v = compact[i] * 2;
      merged.push(v);
      gained += v;
      i++;
    } else {
      merged.push(compact[i]);
    }
  }
  while (merged.length < line.length) merged.push(0);
  return { line: merged, gained };
}

function __mergeApplyMove(board, direction, width = 4) {
  const next = board.slice();
  let gained = 0;
  for (let n = 0; n < width; n++) {
    const indices = [];
    for (let i = 0; i < width; i++) {
      indices.push(direction === 'left' || direction === 'right' ? n * width + i : i * width + n);
    }
    let values = indices.map((i) => board[i]);
    const reverse = direction === 'right' || direction === 'down';
    if (reverse) values = values.reverse();
    const r = __mergeLine(values);
    gained += r.gained;
    const out = reverse ? r.line.slice().reverse() : r.line;
    indices.forEach((idx, i) => { next[idx] = out[i]; });
  }
  return { board: next, gained, changed: next.some((v, i) => v !== board[i]) };
}

function __mergeCanMove(board, width = 4) {
  if (board.some((v) => v === 0)) return true;
  for (let r = 0; r < width; r++) {
    for (let c = 0; c < width; c++) {
      const i = r * width + c;
      if (c + 1 < width && board[i] === board[i + 1]) return true;
      if (r + 1 < width && board[i] === board[i + width]) return true;
    }
  }
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  const gridDisplay = document.querySelector('.grid');
  const scoreDisplay = document.getElementById('score');
  const resultDisplay = document.getElementById('result');
  const width = 4;
  const cells = [];
  let board = Array(width * width).fill(0);
  let score = 0;
  let ended = false;
  const colors = {
    0: '#afa192', 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#ffcea4',
    32: '#e8c064', 64: '#ffab6e', 128: '#fd9982', 256: '#ead79c',
    512: '#76daff', 1024: '#beeaa5', 2048: '#d7d4f0',
  };

  function render() {
    board.forEach((v, i) => {
      cells[i].textContent = String(v);
      cells[i].style.backgroundColor = colors[v] || '#d7d4f0';
    });
    scoreDisplay.textContent = String(score);
  }

  function spawn() {
    const empty = [];
    board.forEach((v, i) => { if (v === 0) empty.push(i); });
    if (!empty.length) return false;
    const idx = empty[Math.floor(Math.random() * empty.length)];
    board[idx] = 2;
    return true;
  }

  function finish(text) {
    if (ended) return;
    ended = true;
    resultDisplay.textContent = text;
    document.removeEventListener('keyup', control);
  }

  function move(direction) {
    if (ended) return;
    const r = __mergeApplyMove(board, direction, width);
    if (!r.changed) {
      if (!__mergeCanMove(board, width)) finish('Игра окончена');
      return;
    }
    board = r.board;
    score += r.gained;
    spawn();
    render();
    if (board.some((v) => v >= 2048)) finish('Победа!');
    else if (!__mergeCanMove(board, width)) finish('Игра окончена');
  }

  function control(e) {
    if (e.key === 'ArrowLeft' || e.keyCode === 37) move('left');
    else if (e.key === 'ArrowUp' || e.keyCode === 38) move('up');
    else if (e.key === 'ArrowRight' || e.keyCode === 39) move('right');
    else if (e.key === 'ArrowDown' || e.keyCode === 40) move('down');
  }

  for (let i = 0; i < width * width; i++) {
    const cell = document.createElement('div');
    gridDisplay.appendChild(cell);
    cells.push(cell);
  }
  resultDisplay.textContent = '';
  spawn();
  spawn();
  render();
  document.addEventListener('keyup', control);

  let tsX = 0;
  let tsY = 0;
  document.addEventListener('touchstart', (e) => {
    tsX = e.touches[0].clientX;
    tsY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - tsX;
    const dy = e.changedTouches[0].clientY - tsY;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }, { passive: true });
});
