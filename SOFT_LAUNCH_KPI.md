# Soft-launch funnel & KPI

Цель документа — дать один набор метрик для первых дней запуска. Решения принимаются по воронке, а не по суммарному числу событий.

## 1. Воронка

Основная последовательность:

`open_bot → open_game → finish → replay/share → return_visit`

Сервер считает её в `GET /stats` и возвращает объект `funnel`.

Для временного окна используйте:

```bash
curl -fsS -H "Authorization: Bearer $HUB_ADMIN_TOKEN" \
  "https://api.example.ru/stats?days=1"

curl -fsS -H "Authorization: Bearer $HUB_ADMIN_TOKEN" \
  "https://api.example.ru/stats?days=7"
```

`days` допускает 1–90. Без параметра возвращается всё накопленное время.

### Метрики funnel

- `open_sessions` — уникальные ephemeral-сессии открытия Mini App;
- `sessions_with_game` — сколько из этих сессий дошло хотя бы до одной игры;
- `game_starts` — число стартов раундов/игр, включая повторы в той же сессии;
- `finishes` — завершённые раунды;
- `replays` — нажатия «Ещё раз» после результата;
- `shares` — успешные share actions;
- `returning_sessions` — запуск в другой календарный день на том же клиенте;
- `next_day_return_events` — возвраты ровно через один локальный день;
- `start_rate_pct = sessions_with_game / open_sessions` — настоящая session conversion, поэтому не должна превышать 100%;
- `completion_rate_pct = finishes / game_starts`;
- `replay_rate_pct = replays / finishes`;
- `share_rate_pct = shares / finishes`;
- `returning_session_share_pct = returning_sessions / open_sessions`.

`game_funnel` показывает starts / finishes / replays / shares отдельно по каждой игре.

## 2. Privacy limitation

`return_visit` специально **не является классическим D1 retention**.

До согласия приложение не создаёт постоянный anonymous user id. Для корректной воронки каждый запуск Mini App получает случайный ephemeral session id: он создаётся только в памяти текущего открытия, не сохраняется в локальной analytics history и не используется повторно при следующем визите. Отдельно в localStorage хранится только дата последнего визита. При следующем запуске сервер получает факт возвратной сессии и gap в днях, но не может связать два анонимных визита в профиль.

Поэтому:

- `start_rate_pct` корректно измеряет долю открытий, в которых началась хотя бы одна игра;
- `returning_session_share_pct` — корректная агрегатная метрика возвратных сессий;
- `next_day_return_events` — количество next-day return signals;
- нельзя называть эти показатели `D1 unique-user retention`;
- не добавлять fingerprint или persistent random id только ради более красивой retention-цифры.

## 3. Soft-launch targets

Пороговые значения рассчитаны как продуктовые ориентиры для коротких casual Mini App сессий. Это не отраслевой SLA: после накопления собственных данных baseline нужно заменить реальными квартилями проекта.

| KPI | Green | Yellow | Red | Что проверять при Red |
| --- | ---: | ---: | ---: | --- |
| Start rate | ≥ 70% | 55–69.9% | < 55% | первый экран, daily hero, названия/карточки игр, время до первого тапа |
| Completion rate | ≥ 45% | 30–44.9% | < 30% | сложность, управление, runtime errors, слишком длинная сессия |
| Replay rate | ≥ 20% | 10–19.9% | < 10% | game feel, result screen, мотивация улучшить рекорд |
| Share rate | ≥ 5% | 2–4.9% | < 2% | ценность результата, deep link, share flow |
| Returning-session share* | ≥ 15% | 8–14.9% | < 8% | daily challenge, streak, разнообразие игр, отсутствие причины вернуться |

\* Смотреть не раньше чем после нескольких полных суток; в первый день метрика бессмысленна.

## 4. Minimum sample

Не принимать продуктовые решения по первым десяткам запусков.

Рекомендуемый порядок:

- `< 50 open_sessions` — только ловить P0/P1 и очевидные UX-сбои;
- `50–99` — смотреть направления, но не отключать игру только по проценту;
- `100–299` — можно принимать первые решения по start/completion/replay;
- `300+` — сравнивать игры через `game_funnel` и выбирать кандидатов на дальнейший polish/скрытие.

Для return metrics нужен ещё и временной горизонт минимум 3–7 суток.

## 5. Decision rules

### Хаб

Если `start_rate_pct < 55%` при 100+ открытиях — не добавлять новые игры. Сначала переработать верх первого экрана и CTA.

Если start rate зелёный, но `finish_per_open_pct` слабый — проблема внутри игр, а не в меню.

### Отдельная игра

После 50+ starts конкретной игры:

- completion `< 25%` — проверить управление/сложность/finish contract;
- replay `< 10%` — игра не создаёт желания улучшить результат;
- starts заметно ниже соседних игр при нормальной completion — проблема карточки, названия или positioning;
- starts высокие, completion и replay высокие — кандидат на hero/daily приоритет.

Не сравнивать абсолютные scores между играми: единицы и правила разные.

### Retention

Если через 7 суток `returning_session_share_pct < 8%`, не пытаться лечить это ещё одной игрой. Приоритет:

1. daily challenge;
2. streak feedback;
3. личный рекорд;
4. более сильный replay loop;
5. только затем новый контент.

## 6. Daily review

В первые 7 дней один раз в сутки фиксировать:

- `open_sessions`;
- `start_rate_pct`;
- `completion_rate_pct`;
- `replay_rate_pct`;
- `share_rate_pct`;
- `returning_session_share_pct`;
- `next_day_return_events`;
- top/bottom игры по starts, completion, replay;
- HTTP 4xx/5xx и client/runtime complaints отдельно от продуктовой воронки.

Сохранять snapshot цифр с датой, чтобы видеть тренд, а не только текущее накопленное значение.

## 7. Go / iterate / hide

**GO:** start ≥70%, completion ≥45%, replay ≥20%, нет P0/P1, хотя бы одна игра стабильно сильнее среднего.

**ITERATE:** технически всё стабильно, но 1–2 основных KPI в yellow — делать точечный UX/game-feel pass и снова измерять.

**HIDE GAME:** конкретная игра после достаточной выборки одновременно имеет низкие starts, completion <25% и replay <10%, а быстрый фикс не очевиден. Лучше 4–5 сильных игр, чем 7 слабых карточек.

**NO-GO:** runtime/auth/privacy проблемы, completion массово <20%, либо funnel нельзя доверять из-за потери событий.
