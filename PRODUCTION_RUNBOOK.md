# Production deploy / rollback runbook

Этот документ описывает безопасный выпуск `hub` после merge production-hardening PR. Он не привязан к конкретному облаку: frontend — статический HTTPS, `server` и `bot` — два Node.js 20+ процесса, production storage — только Postgres.

## 1. Release gate

Не выпускать релиз, пока одновременно не выполнено всё ниже:

- PR mergeable, не draft, без незакрытых блокеров review;
- GitHub Actions `CI` зелёный на точном release SHA;
- `npm ci && npm run smoke` проходит на Node 20;
- известен `RELEASE_SHA`; сохранён `PREVIOUS_SHA` предыдущего рабочего релиза;
- опубликованы реальные policy/offer URLs;
- Mini App URL и API доступны только по HTTPS;
- подготовлен Postgres backup;
- есть хотя бы один MAX user_id администратора либо сознательно оставлен пустой `HUB_ADMIN_IDS` (тогда `/cast` и bot `/stats` недоступны всем).

Рекомендуемый порядок:

```bash
git fetch origin
git checkout --detach <RELEASE_SHA>
npm ci
npm run smoke
```

После smoke production-хосту dev dependencies не нужны:

```bash
npm prune --omit=dev
```

## 2. Production environment

Обязательный минимум:

```env
NODE_ENV=production
BOT_TOKEN=<MAX bot token>
DATABASE_URL=postgres://user:password@host:5432/hub
HUB_HASH_SALT=<random secret >= 32 chars>
HUB_ADMIN_TOKEN=<different random secret >= 32 chars>
HUB_ADMIN_IDS=<MAX user_id через запятую>
HUB_CORS_ORIGIN=https://games.example.ru
HUB_WEBAPP_URL=https://games.example.ru
HUB_BOT_USERNAME=id0000000000_bot
HUB_MAX_AUTH_AGE_SECONDS=3600
PORT=8787
```

`HUB_HASH_SALT` и `HUB_ADMIN_TOKEN` должны быть разными секретами. MAX рекомендует интервал свежести `initData` около одного часа; не расширяйте `HUB_MAX_AUTH_AGE_SECONDS` без отдельной причины и threat review.

Пример генерации secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Не хранить `.env`, database dumps, bot token или реальные user ids в git/CI logs. Если Postgres находится не в доверенной локальной сети, включить TLS в `DATABASE_URL` согласно требованиям провайдера.

## 3. Database preflight

Перед каждым production deploy:

```bash
pg_dump --format=custom --file="hub-before-${RELEASE_SHA}.dump" "$DATABASE_URL"
psql "$DATABASE_URL" -c 'select 1;'
```

Текущая схема обновляется идемпотентными `CREATE ... IF NOT EXISTS` и additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`; destructive migrations в проекте сейчас отсутствуют. Будущие `DROP`, rename или изменение типа требуют отдельного migration/rollback plan.

Backup хранить отдельно от application host и проверять, что файл не пустой.

## 4. Deploy order

### 4.1 API server

Сначала запустить/обновить `server`:

```bash
npm run server
```

Процесс должен работать под supervisor/systemd/container orchestrator и автоматически перезапускаться после crash/reboot. Node-порт `8787` не выставлять напрямую в интернет — наружу публикуется только HTTPS reverse proxy/ingress.

Проверка:

```bash
curl -fsS https://api.example.ru/health
```

Ожидается JSON с `driver: "pg"`. Любой другой driver в production — stop deploy.

Проверить закрытые admin endpoints:

```bash
curl -i https://api.example.ru/stats
curl -i https://api.example.ru/export.csv
```

Без Authorization оба должны вернуть `401`.

С токеном:

```bash
curl -fsS -H "Authorization: Bearer $HUB_ADMIN_TOKEN" https://api.example.ru/stats
```

### 4.2 Static frontend

Публиковать frontend атомарно: новая versioned directory/object prefix → smoke → переключение active symlink/CDN origin. Не перезаписывать рабочую директорию по одному файлу.

После публикации проверить:

- `index.html` отдаётся по HTTPS;
- нет mixed content;
- `HUB_CONFIG.bot`, `policyUrl`, `offerUrl`, `orgName` содержат production values;
- API endpoint в frontend указывает на production HTTPS API;
- в browser console нет 404 и внешних runtime requests из `games/`.

### 4.3 MAX bot

Бота обновлять последним:

```bash
npm run bot
```

Ожидаемый startup: Postgres доступен, `BOT_TOKEN` валиден, polling стартует. Если `HUB_ADMIN_IDS` пуст, admin-команды намеренно fail-closed.

## 5. Ingress/WAF baseline

Обязательные свойства ingress:

- TLS termination; HTTP → HTTPS redirect;
- request body limit не выше server contract (`32 KiB`);
- не проксировать произвольные internal headers;
- access logs не должны писать request body, `init_data`, Authorization или query secrets;
- `/stats` и `/export.csv` дополнительно можно ограничить trusted IP/VPN, но Bearer auth остаётся обязательной;
- rate limiting включить минимум на `/ev`, `/sub`, `/forget`.

Стартовый безопасный baseline, который нужно скорректировать по реальным метрикам:

- `/ev`: 120 req/min/IP, burst 40;
- `/sub`, `/forget`: 20 req/min/IP, burst 5;
- `/stats`, `/export.csv`: 10 req/min/IP.

Не блокировать CORS как замену authentication: CORS защищает браузерный origin, но не сервер от прямого HTTP-клиента.

## 6. Post-deploy smoke

### Automated

На точном deployed SHA:

```bash
npm run smoke
```

Health/API:

```bash
curl -fsS https://api.example.ru/health
curl -fsS -H "Authorization: Bearer $HUB_ADMIN_TOKEN" https://api.example.ru/stats
```

### MAX WebView — обязательно вручную

Проверить минимум на одном Android и одном iOS/WebView-клиенте, если они входят в целевую аудиторию:

1. Открытие Mini App из карточки бота.
2. Меню не зависает, нет бесконечного reload/CPU spike.
3. Каждая включённая игра стартует и управляется touch.
4. Merge: no-op swipe не создаёт плитку; заполненное поле с допустимым merge не завершает игру.
5. Quiz/Sapper daily: одинаковый daily seed в пределах московских суток.
6. Завершение игры показывает result один раз.
7. «Ещё раз» действительно создаёт новый корректный run.
8. Share/deep link открывает внутренний экран шеринга MAX либо корректный MAX deep-link, не уводя штатный fallback во внешний браузер.
9. Cross-origin `/ev` принимает browser beacon; в Network нет CORS/preflight ошибок analytics.
10. До consent analytics не содержит MAX identity.
11. Subscribe после consent проходит; повторная подписка не создаёт дубль.
12. `/forget`/удаление данных проходит только с валидным MAX initData.
13. Bot `/stats` и `/cast` доступны только admin ids.

После smoke сравнить server logs: не должно быть циклических `ready/cfg`, массовых `401` на валидном Mini App, 404 внутри `games/`, reconnect loop или uncaught exceptions.

## 7. Go / no-go criteria

**GO**, если:

- CI green на deployed SHA;
- `/health` показывает Postgres;
- MAX auth/subscription работают;
- все включённые игры проходят ручной smoke;
- нет P0/P1 ошибок в логах;
- rollback SHA и DB backup подтверждены.

**NO-GO / rollback**, если выполняется хотя бы одно:

- Mini App не стартует или зависает;
- auth ошибочно принимает неподписанный identity либо валидные пользователи массово получают 401;
- bot/admin access открыт неадминистратору;
- analytics/request logs содержат raw identity до consent;
- database errors/lost writes;
- критическая игра не завершается либо завершается ложным образом;
- error rate после deploy заметно выше baseline.

## 8. Rollback

Rollback должен возвращать **frontend + server + bot к одному и тому же `PREVIOUS_SHA`**, а не откатывать компоненты независимо без проверки контрактов.

1. Остановить rollout новой версии, не удаляя logs/backup.
2. Зафиксировать incident timestamp и bad `RELEASE_SHA`.
3. Переключить static frontend на артефакт `PREVIOUS_SHA`.
4. На server/bot host:

```bash
git fetch origin
git checkout --detach <PREVIOUS_SHA>
npm ci --omit=dev
```

5. Перезапустить API server, проверить `/health`.
6. Перезапустить bot.
7. Повторить короткий MAX smoke.
8. Не восстанавливать DB backup автоматически, если проблема не связана с данными: текущий код не содержит destructive migrations, а восстановление backup может потерять легитимные события/подписки после момента snapshot.
9. Restore DB выполнять только после подтверждённой data corruption и отдельного решения.

## 9. After release

В первые часы после релиза контролировать:

- process restarts/crashes;
- HTTP 4xx/5xx по endpoint;
- Postgres connections/errors;
- `open_sessions → sessions_with_game → finish` и session-based `start_rate_pct`;
- долю `share_ok` и `notify_subscribe`;
- неожиданные всплески `/ev`;
- 401 `bad init_data`;
- сообщения пользователей о touch/layout проблемах.

После стабильного выпуска зафиксировать production SHA/tag и не использовать плавающий branch head как описание фактически развернутой версии.
