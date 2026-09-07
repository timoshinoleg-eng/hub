# Сторонний код

## Игры: he-is-talha/html-css-javascript-games

Источник: https://github.com/he-is-talha/html-css-javascript-games
Лицензия: **MIT** · Copyright (c) 2024 Talha Bin Yousaf
Проверено: 07.09.2026, 274★, коммит 04.09.2026

Текст лицензии:

```
MIT License

Copyright (c) 2024 Talha Bin Yousaf

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Что важно понимать про эту лицензию

MIT распространяется **только на код**. Она не покрывает:

- **изображения и звук**, происхождение которых неизвестно;
- **названия и образы** чужих игр (Pac-Man, Tetris, Flappy Bird, Fruit Ninja и др.);
- **товарные знаки** третьих лиц.

Поэтому в этот хаб попали только те игры, где механика не защищена, а ассеты
отсутствуют или заменены нашими.

## Что сделано с исходниками

| Игра | Изменения |
|---|---|
| `merge` (10-2048) | исправлен баг склейки плиток через границу строки; добавлены свайпы; русский текст; убрано название «2048» |
| `reaction` (35-Whack-A-Mole) | 10 с → 30 с; `touchstart` вместо `click` (иначе задержка 300 мс); русский текст; отправка счёта в хаб |
| `snake` (24-Snake) | `alert()` + `location.reload()` заменены на экран результата; свайпы; русский текст; автостарт |
| `memory` (22-Memory) | **8 PNG неизвестного происхождения удалены**, заменены на эмодзи; 32 тега `<img>` вычищены из разметки; удалён сторонний favicon |
| `sapper`, `quiz`, `echo` | перенесены без изменений, порт запланирован |

## Не используется

12 игр — клоны чужого IP (Pac-Man, Flappy Bird, Fruit Slicer, Space Invaders,
Asteroids, Frogger, Candy Crush, Doodle Jump, Crossy Road, Tetris, Wordle,
Tower Blocks), 3 — азартные механики (Blackjack, Poker, Dice Roll).
Не перенесены в принципе.
