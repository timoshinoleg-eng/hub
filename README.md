# Игротека — хаб мини-игр для MAX

Небольшой no-build хаб HTML5-игр для MAX: статический frontend, Fastify-сервер событий и бот на `@maxhub/max-bot-api`.

## Архитектура

```text
index.html / css/          оболочка хаба
js/bridge.js               capability-adapter MAX Bridge
js/games.js                единый манифест игр
js/main.js                 меню, iframe, result/share/duel/consent
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
```

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

```bash
npm run smoke
```

Полный smoke suite включает:

- проверку локальных ассетов и отсутствия внешних runtime-ресурсов в играх;
- контракт одноразового iframe handshake;
- browser transport и pre-consent privacy contract;
- MAX `initData` HMAC/freshness contract;
- механику Merge;
- московскую границу daily;
- server auth/CORS/delete/export contracts;
- сценарии бота и fail-closed admin;
- deterministic daily для Sapper/Quiz;
- duel logic.

GitHub Actions запускает `npm ci && npm run smoke` на push и pull request.

## Vendor workflow

Исходный пакет игр используется только как upstream-источник. После базовых патчей применяются стабильные production overrides:

```bash
npm run vendor
npm run check
```

`tools/check.mjs` проверяет, что критические Merge/Quiz файлы совпадают с каноническими copies в `tools/overrides/`. Поэтому повторный vendor не должен возвращать уже исправленные gameplay/determinism ошибки.

Новые версии upstream нельзя принимать автоматически: сначала проверить лицензию/ассеты, diff и `npm run smoke`.

## Доступные игры

Текущий manifest содержит семь включённых игр: Merge, Reaction, Snake, Sapper, Quiz, Echo и Memory. Перед публичным релизом каждая включённая игра должна пройти ручной smoke на целевых смартфонах/MAX WebView; `enabled: false` используется для игры, которая не прошла acceptance.

## Deploy checklist

- [ ] `npm run smoke` зелёный локально и в GitHub Actions
- [ ] production env заполнен реальными секретами; дефолтных значений нет
- [ ] Postgres размещён согласно требованиям оператора к локализации данных
- [ ] `bot/config.mjs` содержит реальные реквизиты оператора
- [ ] `index.html` содержит реальные `HUB_CONFIG.bot`, `policyUrl`, `offerUrl`, `orgName`
- [ ] политика/оферта опубликованы и проверены специалистом до запуска
- [ ] Mini App и API доступны только по HTTPS
- [ ] `/stats` и `/export.csv` без Bearer token возвращают 401
- [ ] `/sub`/`/forget` с поддельным или просроченным initData возвращают 401
- [ ] все включённые игры пройдены вручную в MAX на смартфоне
- [ ] в консоли нет 404 и внешних runtime-запросов из `games/`
- [ ] ingress/WAF ограничивает частоту запросов к публичному `/ev`

## Намеренно вне текущего foundation

Платежи, реклама, серверные лидерборды, профили, полноценная админка и realtime multiplayer. Сначала — безопасный измеряемый soft launch.
