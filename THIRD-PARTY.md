# Сторонний код

## Проверенные ревизии

Происхождение каждой игры фиксировано в репозитории, а не только в этом документе:
`tools/upstream-pins.mjs` — единственный источник правды, и `tools/provenance.mjs`
(в `npm run smoke` и CI) проверяет, что этот файл, `THIRD-PARTY.md` и каталог игр
не расходятся.

| Донор | Ревизия | Лицензия | Состояние апстрима |
|---|---|---|---|
| [`he-is-talha/html-css-javascript-games`](https://github.com/he-is-talha/html-css-javascript-games) | `8c366fdf605f` | MIT | активен, обновляется |
| [`ChanMeng666/html-brick-game`](https://github.com/ChanMeng666/html-brick-game) | `b4d9a756ecc8` | MIT | **архивирован**, обновлений не будет |

`npm run vendor` требует именно зафиксированную ревизию и печатает её, если исходников
нет. Обновление донора — отдельное решение: поднять SHA в `tools/upstream-pins.mjs` и
этом документе, прогнать `npm run vendor && npm run check && npm run smoke`, изучить дифф.

### Про `brick` и архивированный донор

`brick` — 33 КБ production-игры, внесённой вручную из отдельного донора с 2 звёздами,
который **архивирован** (последний push 2026-06-17). Практические следствия:

- сверить адаптацию с апстримом нельзя — исходник заморожен навсегда;
- обновлений и security-фиксов от автора не будет;
- любые правки в `games/brick/` принимаются только на ревью, без возможности
  пересверить исходную логику.

Игра рабочая и покрыта `product-контрактом`, но при замене донора искать новый
источник придётся с нуля. Это зафиксировано в `tools/upstream-pins.mjs` как
осознанное решение, а не как упущение.

## Игры: `he-is-talha/html-css-javascript-games`

Исходный код игр взят из MIT-licensed проекта `he-is-talha/html-css-javascript-games`
на зафиксированной ревизии `8c366fdf605f`. Текст MIT-лицензии и copyright notice должны
сохраняться при распространении существенных частей исходного кода. Полный текст
лицензии: [`licenses/he-is-talha-MIT.txt`](licenses/he-is-talha-MIT.txt).

MIT-лицензия на код не подтверждает права на сторонние изображения, аудио, шрифты, товарные знаки или узнаваемые чужие игровые бренды. Поэтому production-пайплайн не должен включать внешние/непроверенные runtime-ассеты из vendored games.

## Текущие адаптации

| Игра | Что изменено |
|---|---|
| `merge` | стабильная собственная move-реализация поверх исходной HTML/CSS-основы: корректные merge rules, game-over, no-op swipe, touch; убраны внешние favicon/брендинг; результат интегрирован с hub |
| `reaction` | мобильный touch, 30-секундная сессия, finish → hub |
| `snake` | свайпы, локальный рекорд, inline game-over вместо `alert/reload`, finish → hub |
| `sapper` | touch/flag UX, адаптивная доска, русские строки, seeded daily, score/finish → hub |
| `quiz` | русский пул вопросов, seeded Fisher–Yates для daily, русские результаты, score/finish → hub |
| `echo` | русские строки, исправление runtime bug, touch, finish → hub |
| `memory` | неизвестные PNG удалены и заменены emoji, touch, moves/finish → hub |
| `sudoku` | убраны внешние favicon/Google Fonts; системный шрифт; score = секунды, finish → hub |
| `lights` | убраны внешние favicon/Google Fonts; системный шрифт; score = ходы, finish → hub |
| `nonogram` | убраны внешние favicon/Google Fonts; банк пазлов расширен 11 → 17; score = секунды, finish → hub |
| `battleship` | убраны внешние favicon/Google Fonts; score = выстрелы, finish → hub |

## Игры: `ChanMeng666/html-brick-game`

`brick` взят из MIT-licensed проекта `ChanMeng666/html-brick-game` (Copyright (c) 2026
Chan Meng) на зафиксированной ревизии `b4d9a756ecc8`. **Донор архивирован** — см.
раздел «Про `brick` и архивированный донор» выше. Текст MIT-лицензии сохраняется при
распространении существенных частей кода. Полный текст лицензии:
[`licenses/html-brick-game-MIT.txt`](licenses/html-brick-game-MIT.txt).

| Игра | Что изменено |
|---|---|
| `brick` | удалены OG/schema.org/llms.txt мета и inline «GEO analytics»; удалён блок developer-брендинга с внешними ссылками; Google Fonts @import заменён системным стеком; score/finish → hub; звук — WebAudio без файлов |

`tools/check.mjs` отклоняет внешние `http(s)` runtime-ресурсы в HTML игр. Для критических переписанных файлов используются canonical overrides в `tools/overrides/`, которые повторно применяются после `npm run vendor`.

## Перед обновлением upstream

1. Зафиксировать проверяемый upstream commit/tag в handoff/review.
2. Проверить лицензию и происхождение новых ассетов.
3. Просмотреть diff до применения production overrides.
4. Выполнить `npm run vendor && npm run smoke`.
5. Ручно проверить все включённые игры в мобильном MAX WebView.

## Не использовать без отдельной IP/asset проверки

Клоны, напрямую использующие узнаваемые названия/образы третьих лиц, а также азартные механики не должны автоматически переноситься в продукт только потому, что исходный репозиторий имеет MIT-лицензию.
