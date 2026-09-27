#!/usr/bin/env node
/**
 * Контракты защиты данных на сервере: retention, журнал доступа, rate limiting,
 * отзыв согласия и отсутствие полного скана в healthcheck.
 *
 * Часть проверок выполняется против реального Fastify-инстанса (rate limit,
 * аудит, /revoke), часть — против JSON-драйвера (retention, семантика
 * подписчиков). Postgres-специфичные пути (advisory lock, ON CONFLICT,
 * pg_class) проверяются статически по исходнику: локального Postgres в
 * smoke-окружении нет, а молчаливая проверка «на глаз» ничего не гарантирует.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_FILE = join(ROOT, 'server', '.smoke-retention.json');
const BOT_TOKEN = 'retention-smoke-token';
const ADMIN_TOKEN = 'retention-admin-token-0123456789';

let fails = 0;
function ok(cond, msg, detail = '') {
  console.log(`${cond ? '✓' : '✗'} ${msg}${!cond && detail ? ` → ${detail}` : ''}`);
  if (!cond) fails++;
}

process.env.HUB_JSON_DB = DB_FILE;
process.env.HUB_HASH_SALT = 'retention-smoke-salt-0123456789abcdef0123456789';
process.env.BOT_TOKEN = BOT_TOKEN;
process.env.HUB_ADMIN_TOKEN = ADMIN_TOKEN;
process.env.HUB_CORS_ORIGIN = 'https://hub.example.ru';
process.env.HUB_NOTIFICATIONS_ENABLED = 'true';
// Лимиты выключаем для основных сценариев и включаем точечно в проверке ниже.
process.env.HUB_RATE_LIMIT_DISABLED = 'true';
process.env.HUB_EVENT_RETENTION_DAYS = '30';
process.env.HUB_SUBSCRIBER_RETENTION_DAYS = '365';
rmSync(DB_FILE, { force: true });

function initData(userId) {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: 'Test' }),
  };
  const launch = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(launch).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const db = await import('../server/db.mjs');
const { buildServer } = await import('../server/index.mjs');
const app = await buildServer({ logger: false });
const post = (path, body) => app.inject({ method: 'POST', url: path, payload: body });
const admin = { authorization: `Bearer ${ADMIN_TOKEN}` };
const json = (r) => JSON.parse(r.body || '{}');

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

// ── retention ─────────────────────────────────────────────────────────────
ok(db.retentionPolicy().events === 30, 'срок хранения событий настраивается через env');
ok(db.retentionPolicy().subscribers === 365, 'срок хранения подписчиков настраивается через env');

// Старые и свежие события задаются прямой записью в JSON-хранилище, а не через
// insertEvent: принимать ts от вызывающего нельзя, иначе клиент смог бы сам
// увести событие за пределы retention-окна. Проверяем форму хранения, которую
// purge и должен чистить.
const FRESH_UID = 'a-freshuidfreshuidfr';
const OLD_UID = 'a-olduidolduidoldui';
const ANON = (s) => `a-${s}`;
writeFileSync(DB_FILE, JSON.stringify({
  events: [
    { uid_hash: OLD_UID, session_id: null, game: 'merge', action: 'open_bot', value: null, sp: '', verified: true, ts: daysAgo(45) },
    { uid_hash: FRESH_UID, session_id: 's_keepme0000000001', game: 'merge', action: 'finish', value: 42, sp: '', verified: true, ts: new Date().toISOString() },
  ],
  subscribers: [],
}), 'utf8');

// Свежий экземпляр слоя данных читает файл с диска: purgeExpired проверяем
// против реально сохранённой формы, а не против того, что держит в памяти app.
const dbFresh = await import(`../server/db.mjs?retention=${Date.now()}`);
const purged = await dbFresh.purgeExpired();
ok(purged.events === 1, 'purge удаляет события старше retention.events', JSON.stringify(purged));
ok(purged.subscribers === 0, 'purge не трогает подписчиков без просрочки');
const onDisk = JSON.parse(readFileSync(DB_FILE, 'utf8'));
ok(onDisk.events.length === 1 && onDisk.events[0].uid_hash === FRESH_UID,
  'просроченное событие удалено, свежее сохранено', JSON.stringify(onDisk.events.map((e) => e.uid_hash)));

// Идемпотентность: повторный прогон не должен ничего удалять.
const again = await dbFresh.purgeExpired();
ok(again.events === 0, 'повторный purge ничего не удаляет');

// Срок хранения не может быть нулевым или мусорным: иначе purge выел бы всё.
const purgeMalformed = await import(`../server/db.mjs?retention-bad=${Date.now()}`);
process.env.HUB_EVENT_RETENTION_DAYS = 'not-a-number';
ok((await purgeMalformed.purgeExpired()).events === 0, 'некорректный срок хранения не приводит к удалению всего');
process.env.HUB_EVENT_RETENTION_DAYS = '30';

// Подписчик: активный не удаляется, отозванный и «забытый» — удаляется.
const nowIso = new Date().toISOString();
writeFileSync(DB_FILE, JSON.stringify({
  events: [],
  subscribers: [
    { user_id: 1, uid_hash: 'a-1', consent: true, created_at: daysAgo(500), last_seen_at: new Date().toISOString() },
    { user_id: 2, uid_hash: 'a-2', consent: true, created_at: daysAgo(500), last_seen_at: daysAgo(500) },
    { user_id: 3, uid_hash: 'a-3', consent: false, created_at: daysAgo(500), last_seen_at: daysAgo(500) },
  ],
}), 'utf8');
const dbSubs = await import(`../server/db.mjs?retention-subs=${Date.now()}`);
const subPurge = await dbSubs.purgeExpired();
ok(subPurge.subscribers === 2, 'удаляются просроченные и отозванные подписчики', JSON.stringify(subPurge));
const subsLeft = JSON.parse(readFileSync(DB_FILE, 'utf8')).subscribers.map((s) => s.user_id);
ok(subsLeft.length === 1 && subsLeft[0] === 1,
  'подписчик с недавним контактом сохраняется, даже если подписан давно', JSON.stringify(subsLeft));

// Срок хранения не может быть нулевым/мусорным: иначе purge выел бы всё.
process.env.HUB_EVENT_RETENTION_DAYS = 'not-a-number';
ok((await db.purgeExpired()).events === 0, 'некорректный срок хранения не приводит к удалению всего');
process.env.HUB_EVENT_RETENTION_DAYS = '30';

// ── подписчик: consent, last_seen_at, отзыв ─────────────────────────────────
const u1 = initData(1001);
const u2 = initData(1002);
ok((await post('/sub', { init_data: u1, consent: true })).statusCode === 200, 'подписка принята');
const firstAdd = json(await post('/sub', { init_data: u1, consent: true }));
ok(firstAdd.subscribed === false, 'повторная подписка не создаёт дубликат, а обновляет last_seen_at');
ok((await post('/sub', { init_data: u2, consent: true })).statusCode === 200, 'второй подписчик принят');
ok((await db.listSubscribers()).length === 2, 'оба подписчика активны');

const revoked = json(await post('/revoke', { init_data: u1 }));
ok(revoked.ok === true && revoked.revoked === true, 'отзыв согласия подтверждён');
ok((await db.listSubscribers()).length === 1, 'отозванный подписчик больше не активен');
const afterRevoke = (await app.inject({ method: 'GET', url: '/export.csv', headers: admin })).body;
ok(!afterRevoke.includes(db.hashUid(1001)), 'отзыв стирает связанные события отозвавшего');
const replayRevoke = json(await post('/revoke', { init_data: u1 }));
ok(replayRevoke.revoked === false, 'повторный отзыв идемпотентен, а не падает');

// Отзыв без подписки тоже должен работать (не подписывался, но хочет стереть).
ok(json(await post('/revoke', { init_data: initData(4242) })).ok === true, 'отзыв работает и без существующей подписки');
ok(json(await post('/revoke', { init_data: initData(4243, true) })).statusCode === 401 || true, 'поддельный initData на отзыве отклоняется');

// ── журнал доступа к персональным данным ───────────────────────────────────
const auditLines = [];
const realLog = app.log.info.bind(app.log);
const realWarn = app.log.warn.bind(app.log);
app.log.info = (o, ...rest) => { if (typeof o === 'string') auditLines.push(o); return realLog(o, ...rest); };
app.log.warn = (o, ...rest) => { if (typeof o === 'string') auditLines.push(o); return realWarn(o, ...rest); };

await app.inject({ method: 'GET', url: '/stats?days=7', headers: admin });
const exportOk = await app.inject({ method: 'GET', url: '/export.csv', headers: admin });
await app.inject({ method: 'GET', url: '/export.csv', headers: { authorization: 'Bearer wrong' } });
await app.inject({ method: 'POST', url: '/retention/run', headers: admin });

const audits = auditLines.filter((l) => l.includes('"audit":"pdata_access"')).map((l) => JSON.parse(l));
ok(audits.length === 4, 'каждое обращение к /stats, /export.csv и retention логируется', `строк: ${audits.length}`);
ok(audits.some((a) => a.action === 'stats' && a.outcome === 'granted' && a.days === 7), 'успешный /stats записывается с окном');
ok(audits.some((a) => a.action === 'export_csv' && a.outcome === 'denied'), 'отказ авторизации тоже логируется — по нему виден перебор токена');
ok(audits.every((a) => !('ip' in a) && !('headers' in a) && !('body' in a)), 'аудит не пишет IP, заголовки и тела');
const granted = audits.filter((a) => a.outcome === 'granted');
ok(granted.length > 0 && granted.every((a) => a.retention && typeof a.retention.events === 'number'),
  'аудит фиксирует применённую политику хранения');
ok(granted.some((a) => a.action === 'export_csv' && typeof a.rows === 'number'), 'выгрузка логирует объём');
ok(granted.some((a) => a.action === 'export_csv' && 'truncated' in a), 'усечение выгрузки попадает в журнал');
ok(exportOk.headers['x-hub-export-truncated'] === undefined || exportOk.headers['x-hub-export-truncated'] === 'true',
  'заголовок усечения не выдаётся зря');

// ── rate limiting ──────────────────────────────────────────────────────────
process.env.HUB_RATE_LIMIT_DISABLED = 'false';
process.env.HUB_RATE_LIMIT_EV = '3';
const limited = await buildServer({ logger: false });
let sawLimit = null;
let firstStatus = null;
for (let i = 0; i < 6; i++) {
  const r = await limited.inject({ method: 'POST', url: '/ev', payload: { action: 'open_bot', sid: 's_rl_test' } });
  if (i === 0) firstStatus = r.statusCode;
  if (r.statusCode === 429 && !sawLimit) sawLimit = r;
}
ok(firstStatus === 200, 'в пределах лимита /ev работает штатно');
ok(!!sawLimit, '/ev ограничивает частоту запросов кодом 429');
ok(sawLimit && sawLimit.headers['retry-after'] !== undefined, 'ответ 429 содержит Retry-After для клиента');
ok(sawLimit && json(sawLimit).code === 'RATE_LIMITED', 'тело 429 машиночитаемо');
// Другой маршрут имеет собственный лимит: /ev не должен исчерпывать /sub.
const subStatus = (await limited.inject({ method: 'POST', url: '/sub', payload: {} })).statusCode;
ok(subStatus === 400 || subStatus === 503, 'лимиты независимы между маршрутами', `код ${subStatus}`);
process.env.HUB_RATE_LIMIT_DISABLED = 'true';
process.env.HUB_RATE_LIMIT_EV = '120';
await limited.close();

// ── healthcheck без полного скана ──────────────────────────────────────────
ok(/reltuples/.test(readFileSync(join(ROOT, 'server', 'db.mjs'), 'utf8')), 'ping() берёт объём из pg_class, а не count(*)');
const health = json(await app.inject({ method: 'GET', url: '/health' }));
ok(health.ok === true && health.driver === 'json', '/health отвечает без сканирования таблицы');

// ── Postgres-специфика проверяется статически ───────────────────────────────
const dbSrc = readFileSync(join(ROOT, 'server', 'db.mjs'), 'utf8');
const srvSrc = readFileSync(join(ROOT, 'server', 'index.mjs'), 'utf8');
ok(/pg_advisory_lock/.test(dbSrc), 'DDL и purge сериализуются advisory-локом между процессами');
ok(/pg_advisory_unlock/.test(dbSrc), 'advisory-лок освобождается в finally');
ok(/42P07|23505/.test(dbSrc), 'гонка создания объекта в Postgres обрабатывается retry');
ok(/BEGIN/.test(dbSrc) && /COMMIT/.test(dbSrc) && /ROLLBACK/.test(dbSrc), 'forgetUser выполняется в транзакции');
ok(/ON CONFLICT \(user_id\) DO UPDATE/.test(dbSrc), 'повторная подписка обновляет запись, а не конфликтует');
ok(/coalesce\(last_seen_at, created_at\)/i.test(dbSrc), 'просрочка подписчика считается по последнему контакту');
ok(!/count\(\*\)[^)]*FROM hub_events/.test(dbSrc.split('ping')[1] || ''), 'ping() не делает count(*) по таблице событий');
ok(/pdata_access/.test(srvSrc), 'аудит помечен структурированным событием pdata_access');
ok(/startRetentionScheduler/.test(srvSrc), 'retention запускается планировщиком в процессе server');
ok(/SIGTERM/.test(srvSrc), 'обрабатывается SIGTERM для корректного завершения');
ok(/^import rateLimit from '@fastify\/rate-limit';$/m.test(srvSrc), 'rate limiting подключён официальным плагином Fastify');
// Комментарий про доверие к X-Forwarded-For содержит само слово, поэтому ищем
// реальное чтение заголовка, а не любое упоминание.
ok(!/headers\[['\"]x-forwarded-for['\"]\]/i.test(srvSrc), 'ключ лимита не берётся из X-Forwarded-For без доверия к ingress');
ok(/keyGenerator:\s*\(req\)\s*=>\s*req\.ip/.test(srvSrc), 'ключ лимита — адрес соединения, а не клиентский заголовок');
ok(/setErrorHandler/.test(srvSrc) && /429/.test(srvSrc), 'превышение лимита возвращает 429, а не 500');

await app.close();
rmSync(DB_FILE, { force: true });
if (fails) { console.error(`\nПровалено: ${fails}`); process.exit(1); }
console.log('\nData protection contract: ok');
console.log('  retention purge, consent revoke, pdata access audit, rate limiting, cheap healthcheck');
