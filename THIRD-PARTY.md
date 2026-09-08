# Сторонний код

## Игры: `he-is-talha/html-css-javascript-games`

Исходный код игр взят из MIT-licensed проекта `he-is-talha/html-css-javascript-games`. Текст MIT-лицензии и copyright notice должны сохраняться при распространении существенных частей исходного кода.

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

`tools/check.mjs` отклоняет внешние `http(s)` runtime-ресурсы в HTML игр. Для критических переписанных файлов используются canonical overrides в `tools/overrides/`, которые повторно применяются после `npm run vendor`.

## Перед обновлением upstream

1. Зафиксировать проверяемый upstream commit/tag в handoff/review.
2. Проверить лицензию и происхождение новых ассетов.
3. Просмотреть diff до применения production overrides.
4. Выполнить `npm run vendor && npm run smoke`.
5. Ручно проверить все включённые игры в мобильном MAX WebView.

## Не использовать без отдельной IP/asset проверки

Клоны, напрямую использующие узнаваемые названия/образы третьих лиц, а также азартные механики не должны автоматически переноситься в продукт только потому, что исходный репозиторий имеет MIT-лицензию.
