# Игротека — хаб мини-игр для MAX

> **LEGACY / SEPARATE PRODUCT NOTICE**  
> This repository is the standalone MAX game hub previously served from `quiz.chatbot24.su`. It is **not OFELIYA: STRAIN ZERO**, must not be used as an OFELIYA production source, and must not provide bot credentials, deployment config, API authority or release evidence for OFELIYA. Canonical OFELIYA lives in `timoshinoleg-eng/ofeliya`, uses `@id402806822924_5_bot`, and is served from `https://ofeliya.freeveol.dpdns.org/ofeliya/`. The historical Chatbot24 bot `@id402806822924_1_bot` is retired.

<!-- product-snapshot:start -->
> **Продукт:** единый MAX Mini App-хаб из 12 HTML5-игр с общим bridge, ботом, daily-механиками, challenges и privacy-aware аналитикой.
>
> **Стадия:** active / soft-launch foundation · **Платформа:** MAX · **Продуктовый фокус:** retention, повторные сессии и будущая монетизация портфеля игр.
<!-- product-snapshot:end -->

Небольшой no-build хаб HTML5-игр для MAX: статический frontend, Fastify-сервер событий и бот на `@maxhub/max-bot-api`.

## Архитектура

```text
index.html / css/          оболочка хаба
js/bridge.js               capability-adapter MAX Bridge
js/games.js                единый манифест игр
js/main.js                 меню, iframe, result/share/duel/consent
js/ui-state.js             чистые правила текстов и состояний (тестируются напрямую)
js/track.js                анонимная аналитика + signed initData после consent
js/daily.js                единая граница «пазла дня» Europe/Moscow
games/_boot.js             одноразовый postMessage handshake iframe ↔ hub
games/<id>/                локальные игры без внешних runtime-ассетов
server/max-auth.mjs        HMAC-проверка MAX WebApp initData
server/index.mjs           /ev, /sub, /forget, /stats, /export.csv, /health
server/db.mjs              Postgres production / JSON только dev-test
bot/                       MAX bot
legal/                     шаблоны правовых документов
tools/                     smoke tests, vendor и стабильные overrides
licenses/                  полные тексты лицензий сторонних доноров
```

Лицензирование: собственный код — MIT ([`LICENSE`](LICENSE)), обязательные уведомления о
стороннем коде — [`NOTICE`](NOTICE) и [`THIRD-PARTY.md`](THIRD-PARTY.md).

## Требования

- Node.js 20+
- HTTPS для Mini App и production API
- Postgres для production
- действующий MAX `BOT_TOKEN`

## Локальный запуск

```bash
npm ci
npm run smoke
npm run dev
```

Для локального `server`/`bot` создайте `.env` из `.env.example`. JSON storage допустим только для dev/test и не должен использоваться одновременно несколькими production-процессами.

## Production-конфигурация

Обязательные параметры:

```env
NODE_ENV=production
BOT_TOKEN=...
DATABASE_URL=postgres://...
HUB_HASH_SALT=<случайный секрет >= 32 символов>
HUB_ADMIN_TOKEN=<отдельный случайный секрет >= 32 символов>
HUB_ADMIN_IDS=<MAX user_id администраторов бота через запятую>
HUB_CORS_ORIGIN=https://games.example.ru
HUB_WEBAPP_URL=https://games.example.ru
HUB_BOT_USERNAME=id0000000000_bot
HUB_BOT_WEBHOOK_DOMAIN=https://games.example.ru
HUB_BOT_WEBHOOK_PORT=8788
HUB_BOT_WEBHOOK_PATH=/hub/bot/webhook
HUB_BOT_WEBHOOK_SECRET=<случайный секрет >= 32 символов>
```

Production server откажется запускаться без Postgres, `BOT_TOKEN`, безопасного `HUB_ADMIN_TOKEN` и HTTPS-origin. `db.init()` отдельно откажется работать с отсутствующим/дефолтным/коротким `HUB_HASH_SALT`. Production bot также откажется использовать JSON storage.

Production bot принимает события только через HTTPS webhook: режим long polling остаётся только для локальной разработки и не может очистить существующую production subscription. По умолчанию `HUB_NOTIFICATIONS_ENABLED=false`: кнопки подписки и endpoint `/sub` выключены. Для включения уведомлений обязательны реальные `HUB_ORG_NAME`, `HUB_ORG_INN`, `HUB_POLICY_URL`, `HUB_OFFER_URL` и `HUB_SUPPORT_EMAIL`; иначе production не стартует.

### Authentication contract

`initDataUnsafe` используется только для UX/navigation и **не является доверенной identity**. Для операций, которым нужен пользователь, frontend передаёт подписанный `WebApp.initData`; сервер:

1. разбирает параметры;
2. исключает `hash`, сортирует остальные поля;
3. проверяет HMAC-SHA256 по `BOT_TOKEN`;
4. проверяет `auth_date`;
5. только после этого получает `user.id`.

`POST /sub` и `POST /forget` не принимают self-asserted `user_id`. `/stats` и `/export.csv` закрыты `Authorization: Bearer <HUB_ADMIN_TOKEN>`.

## Privacy contract

До явного consent игровые события отправляются анонимно и не содержат MAX identity или `initData`. Локальная история также не хранит `user_id`/`initData`.

После consent signed `initData` может передаваться серверу для проверки пользователя. В analytics БД сохраняется HMAC-псевдоним, а raw `user_id` хранится только в таблице подписчиков, где он нужен для отправки уведомления. `/forget` удаляет подписчика и связанные pseudonymous events.

## Проверки

Три уровня, от быстрого к медленному. Локально перед коммитом достаточно `npm run verify`.

```bash
npm run lint        # biome, без браузера
npm run smoke       # контракты репозитория, без браузера
npm run test:unit   # юнит-тесты чистых модулей
npm run test:e2e    # браузерные тесты Playwright
npm run verify      # всё перечисленное по порядку
```

### Уровень 1 — контракты без браузера (`npm run smoke`)

Это не тесты кода, а контракты репозитория: происхождение игрового кода,
лицензии, воспроизводимость vendor-пайплайна, приватность транспорта, логика
сервера. Смысл их в том, что они ломаются громко и рано — когда зависимость ещё
не уехала в прод.

- локальные ассеты игр и отсутствие внешних runtime-ресурсов;
- воспроизводимость vendor-пайплайна: все пары override совпадают байт в байт,
  осиротевших канонов нет;
- происхождение: у каждого донора зафиксирована ревизия, состояние
  архивированного донора утверждается явно;
- лицензии: `LICENSE`, `NOTICE`, вендоренные модули со своими лицензиями;
- одноразовый iframe handshake и versioned imports во всём графе оболочки,
  включая `launch-router.js`;
- privacy/transport аналитики: до согласия нет identity, `initData` не
  сохраняется локально, отзыв согласия работает;
- retention, журнал доступа к персональным данным и rate limits;
- MAX `initData` HMAC/freshness, CORS, admin fail-closed;
- московская граница daily, детерминизм Sapper/Quiz, логика дуэлей;
- правила UI-состояний, оверлей оболочки, доступность.

### Уровень 2 — юнит-тесты (`npm run test:unit`)

Чистые модули исполняются, а утверждаются результаты: `dailySeed`, `progress`,
`duel`, `ui-state`, `engagement`, маршрутизация Quizzzz, манифест игр. Покрытие
99% строк с принудительными порогами.

Пороги намеренно не распространяются на `main.js`, `track.js` и `bridge.js`:
эти модули проверяются исполнением в браузере, и включение их сюда дало бы
фиктивное покрытие — строки выполнялись бы, а проверок поведения не добавилось.

### Уровень 3 — браузерные тесты (`npm run test:e2e`)

Первый раз в проекте запускается настоящий DOM. Три профиля: 390×844, 360×640
и десктопт; 360×640 — самый тесный целевой размер MAX WebView.

- меню рендерит все игры без ошибок консоли и без горизонтального переполнения;
- handshake отправляет ровно один `cfg` (регрессия на цикл `ready↔cfg`);
- все игры загружаются, рисуют и не тянут внешнее;
- MAX BackButton, «К играм» и Escape очищают результат и возвращают фокус;
- axe-core по меню, результату и панели данных;
- Web Vitals собираются в MAX-подобном окружении.

Первая установка браузера: `npm run test:e2e:install`.

### В CI

Два job. Быстрый gate — lint, smoke и юнит-тесты с порогами покрытия. Браузерный
job стартует только при зелёном gate: не имеет смысла тратить минуты Chromium,
если сломан контракт без браузера. Прогоны отменяются по `concurrency`, чтобы
серия пушей в ветку не оставляла устаревшие проверки, решающие статус PR.

Каталог `js/vendor/` исключён из линтера: вендоренный код не наш, и линтить его —
значит запретить его обновлять.

## Vendor workflow

Исходный пакет игр используется только как upstream-источник. После базовых патчей применяются стабильные production overrides:

```bash
npm run vendor
npm run check
```

`tools/overrides/` — канонические копии адаптированных игровых файлов, которые
`npm run vendor` копирует в `games/` поверх апстрима. Реестр пар живёт в
`tools/overrides.manifest.mjs` и используется обоими скриптами, поэтому расхождение
между «что копируется» и «что проверяется» невозможно: `tools/check.mjs` сверяет все
пары байт в байт, а `tools/vendor-contract.mjs` дополнительно требует, чтобы канонические
файлы существовали, не дублировались и не оставались вне реестра. Повторный vendor
поэтому не может вернуть уже исправленные gameplay/determinism ошибки в проверенной
production-версии игры.

Новые версии upstream нельзя принимать автоматически: сначала проверить лицензию/ассеты, diff и `npm run smoke`.

### Про origin и закреплённые коммиты

`THIRD-PARTY.md` фиксирует проверенные upstream SHA для каждой игры. `npm run vendor`
достаёт строго эти ревизии, а не последний `HEAD`: обновление апстрима — отдельное
решение с проверкой лицензии, ассетов и диффа, а не побочный эффект сборки.

Если upstream-репозиторий игры архивирован или больше не поддерживается, это
означает, что донор больше нельзя обновить: такая игра остаётся в каталоге, но её
адаптацию придётся вести внутри `tools/overrides/` без возможности сверить с апстримом.

## Доступные игры

Текущий manifest содержит двенадцать включённых игр: Merge, Reaction, Snake, Sapper, Quiz, Echo, Memory, Sudoku, Lights, Nonogram, Battleship и Brick. Перед публичным релизом каждая включённая игра должна пройти ручной smoke на целевых смартфонах/MAX WebView; `enabled: false` используется для игры, которая не прошла acceptance.

## Deploy checklist

- [ ] `npm run verify` зелёный локально и оба job в GitHub Actions зелёные
- [ ] production env заполнен реальными секретами; дефолтных значений нет
- [ ] Postgres размещён согласно требованиям оператора к локализации данных
- [ ] `bot/config.mjs` содержит реальные реквизиты оператора
- [ ] `runtime-config.js` содержит реальные `HUB_CONFIG.bot`, `policyUrl`, `offerUrl`, `orgName`
      и рабочий `HUB_TRACK_ENDPOINT`; в меню не видно баннера «Ограниченный режим»
- [ ] политика/оферта опубликованы и проверены специалистом до запуска
- [ ] Mini App и API доступны только по HTTPS
- [ ] `/stats` и `/export.csv` без Bearer token возвращают 401
- [ ] `/sub`/`/forget` с поддельным или просроченным initData возвращают 401
- [ ] все включённые игры пройдены вручную в MAX на смартфоне
- [ ] в консоли нет 404 и внешних runtime-запросов из `games/`
- [ ] rate limits активны (в коде, не только на ingress) и не выбиты легитимным трафиком
- [ ] retention по расписанию выполняется: `POST /retention/run` отвечает и пишет в журнал
- [ ] в server logs нет серии `audit: pdata_access` с `outcome: denied`
- [ ] `/stats` показывает `unverified_events` без лавинообразного роста

## Намеренно вне текущего foundation

Платежи, реклама, серверные лидерборды, профили, полноценная админка и realtime multiplayer. Сначала — безопасный измеряемый soft launch.
