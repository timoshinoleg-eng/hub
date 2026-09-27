#!/usr/bin/env node
/** Сервер событий: анонимная аналитика + authenticated MAX subscriptions. */
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.mjs';
import { verifyMaxInitData } from './max-auth.mjs';
import { notificationConfigProblems, notificationsEnabled } from './notifications.mjs';

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && aa.length > 0 && timingSafeEqual(aa, bb);
}

function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const problems = [];
  if (db.driver !== 'pg') problems.push('DATABASE_URL/Postgres обязателен в production');
  if (!process.env.BOT_TOKEN) problems.push('BOT_TOKEN обязателен для MAX initData validation');
  if ((process.env.HUB_ADMIN_TOKEN || '').length < 32) problems.push('HUB_ADMIN_TOKEN должен быть >=32 символов');
  if (!/^https:\/\//i.test(process.env.HUB_CORS_ORIGIN || '')) problems.push('HUB_CORS_ORIGIN должен быть https:// origin');
  problems.push(...notificationConfigProblems());
  if (problems.length) throw new Error(`Unsafe production config: ${problems.join('; ')}`);
}

function bodyObject(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* invalid payload handled by route validation */ }
  }
  return {};
}

export async function buildServer({ logger = true } = {}) {
  await db.init();
  const opts = { bodyLimit: 32 * 1024 };
  if (logger) {
    opts.logger = process.env.NODE_ENV === 'production'
      ? true
      : { transport: { target: 'pino-pretty', options: { translateTime: true } } };
  }
  const app = Fastify(opts);
  const corsOrigin = process.env.HUB_CORS_ORIGIN || '';

  // ── Rate limiting ────────────────────────────────────────────────────────
  //
  // До этого ограничение было только пожеланием в PRODUCTION_RUNBOOK §5
  // («rate limiting включить минимум на /ev, /sub, /forget»), то есть
  // ответственность была отнесена к внешнему ingress, которого в
  // deploy/compose.production.yml нет. Лимиты теперь в коде.
  //
  // Ключ — IP. Для /ev это защита от DoS и от накрутки воронки; сами события
  // в KPI не попадают без подписи MAX, но неподписанные всё равно писались в
  // базу и съедали место. Лимиты соответствуют значениям из runbook, чтобы
  // документация и поведение не расходились.
  const RATE_LIMITS = {
    '/ev': { max: Number(process.env.HUB_RATE_LIMIT_EV ?? 120), timeWindow: '60 seconds' },
    '/sub': { max: Number(process.env.HUB_RATE_LIMIT_SUB ?? 20), timeWindow: '60 seconds' },
    '/forget': { max: Number(process.env.HUB_RATE_LIMIT_FORGET ?? 20), timeWindow: '60 seconds' },
    admin: { max: Number(process.env.HUB_RATE_LIMIT_ADMIN ?? 10), timeWindow: '60 seconds' },
  };
  const rateLimitEnabled = process.env.HUB_RATE_LIMIT_DISABLED !== 'true';
  if (rateLimitEnabled) {
    await app.register(rateLimit, {
      global: false,
      // Ключ по IP. Заголовки X-Forwarded-For не берём: за ingress стоит
      // несколько хопов, и слепое доверие заголовку позволило бы обходить
      // лимит подменой заголовка, если Caddy его не перезаписывает.
      keyGenerator: (req) => req.ip,
      enableDraftSpec: true,
      addHeadersOnExceeding: { 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
    });
    // errorResponseBuilder в @fastify/rate-limit возвращает только тело и
    // теряет статус (наблюдалось 500 вместо 429), поэтому статус ставим через
    // обработчик ошибок. 429 обязателен: клиент различает «слишком часто» и
    // «сервер сломан», а мониторинг не должен считать это аварией.
    app.setErrorHandler((error, req, reply) => {
      if (error?.statusCode === 429) {
        return reply.code(429)
          .header('retry-after', String(Math.max(1, Math.ceil((Number(error.retryAfter) || 60) / 1000))))
          .send({ error: 'rate_limited', code: 'RATE_LIMITED', retry_after_ms: Number(error.retryAfter) || 60000 });
      }
      if (error?.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        return reply.code(error.statusCode).send({ error: error.code || 'bad_request' });
      }
      req.log.error({ err: error }, 'unhandled request error');
      return reply.code(500).send({ error: 'internal_error' });
    });
  }

  app.addHook('onRequest', async (req, reply) => {
    if (corsOrigin && req.headers.origin === corsOrigin) {
      reply.header('Access-Control-Allow-Origin', corsOrigin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Vary', 'Origin');
    }
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  const clamp = (s, n) => String(s ?? '').slice(0, n);
  const isAction = (s) => /^[a-z_]{2,32}$/.test(String(s || ''));
  const isGame = (s) => /^[a-z]{2,16}$/.test(String(s || ''));
  const isSession = (s) => /^s_[A-Za-z0-9_-]{8,61}$/.test(String(s || ''));
  const verifyBody = (b) => verifyMaxInitData(typeof b?.init_data === 'string' ? b.init_data : '');
  const isAdmin = (req) => {
    const expected = process.env.HUB_ADMIN_TOKEN || '';
    const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    return safeEqual(got, expected);
  };

  // Хелпер для per-route лимитов: при HUB_RATE_LIMIT_DISABLED=true превращается
  // в no-op, чтобы тесты и локальная отладка не упирались в лимиты.
  const limit = (conf) => (rateLimitEnabled
    ? { config: { rateLimit: { ...conf, keyGenerator: (req) => req.ip } } }
    : {});

  app.post('/ev', limit(RATE_LIMITS['/ev']), async (req, reply) => {
    const b = bodyObject(req.body);
    if (!isAction(b.action)) return reply.code(400).send({ error: 'bad action' });
    // Событие считается доверенным только при валидной подписи MAX initData.
    // Без неё запись всё равно сохраняется, но помечается verified=false и
    // не участвует в продуктовой воронке: иначе любой HTTP-клиент может
    // залить open_bot/open_game/finish с произвольным sid и испортить
    // start_rate_pct, по которому SOFT_LAUNCH_KPI принимает go/hide-решения.
    let uid_hash = db.anonId();
    let verified = false;
    if (typeof b.init_data === 'string' && b.init_data) {
      const auth = verifyBody(b);
      if (!auth.ok) return reply.code(401).send({ error: 'bad_init_data', reason: auth.reason });
      uid_hash = db.hashUid(auth.user.id);
      verified = true;
    }
    await db.insertEvent({
      uid_hash,
      session_id: isSession(b.sid) ? b.sid : null,
      game: isGame(b.game) ? b.game : null,
      action: b.action,
      value: Number.isFinite(Number(b.value)) ? Number(b.value) : null,
      sp: clamp(b.sp, 64),
      verified,
    });
    return { ok: true };
  });

  app.post('/sub', limit(RATE_LIMITS['/sub']), async (req, reply) => {
    if (!notificationsEnabled()) return reply.code(503).send({ error: 'subscriptions_disabled' });
    const b = bodyObject(req.body);
    if (b.consent !== true) return reply.code(400).send({ error: 'consent_required' });
    const auth = verifyBody(b);
    if (!auth.ok) return reply.code(401).send({ error: 'bad_init_data', reason: auth.reason });
    const user_id = auth.user.id;
    const added = await db.addSubscriber({
      user_id, uid_hash: db.hashUid(user_id),
      game: isGame(b.game) ? b.game : null, chat_id: null,
      consentText: db.CONSENT_TEXT_ID,
    });
    return { ok: true, subscribed: added };
  });

  // Отзыв согласия: стирает связанные события и помечает подписку отозванной,
  // чтобы человек перестал считаться активным подписчиком и не мог получать
  // уведомления. Отличается от /forget тем, что сохраняет сам факт отзыва.
  app.post('/revoke', limit(RATE_LIMITS['/forget']), async (req, reply) => {
    const b = bodyObject(req.body);
    const auth = verifyBody(b);
    if (!auth.ok) return reply.code(401).send({ error: 'bad_init_data', reason: auth.reason });
    const revoked = await db.revokeSubscriber(auth.user.id);
    await db.forgetUser(auth.user.id);
    return { ok: true, revoked };
  });

  app.post('/forget', limit(RATE_LIMITS['/forget']), async (req, reply) => {
    const b = bodyObject(req.body);
    const auth = verifyBody(b);
    if (!auth.ok) return reply.code(401).send({ error: 'bad_init_data', reason: auth.reason });
    await db.forgetUser(auth.user.id);
    return { ok: true };
  });

  // ── Журнал доступа к персональным данным ────────────────────────────────
  //
  // /stats и /export.csv отдают агрегаты pseudonymised-событий, но обращение к
  // ним само по себе является операцией с персональными данными, которую по
  // 152-ФЗ ст. 19 нужно регистрировать. Пишем только метаданные доступа: без
  // IP, без user-agent и без тела ответа. Отказ авторизации логируется тоже —
  // именно он важен для обнаружения перебора admin-токена.
  const audit = (req, action, detail = {}) => {
    const line = JSON.stringify({
      ts: new Date().toISOString(), audit: 'pdata_access', action,
      outcome: 'granted', days: detail.days ?? null,
      rows: detail.rows ?? null, truncated: detail.truncated ?? null,
      retention: db.retentionPolicy(),
    });
    // stdout в docker собирается как лог; logger может быть отключён в тестах.
    (app.log ? app.log.info.bind(app.log) : console.log)(line);
  };
  const auditDenied = (req, action) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), audit: 'pdata_access', action, outcome: 'denied' });
    (app.log ? app.log.warn.bind(app.log) : console.warn)(line);
  };

  app.get('/stats', limit(RATE_LIMITS.admin), async (req, reply) => {
    if (!isAdmin(req)) { auditDenied(req, 'stats'); return reply.code(401).send({ error: 'unauthorized' }); }
    const rawDays = Number(req.query?.days || 0);
    const days = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 90 ? rawDays : 0;
    const out = await db.stats({ days });
    audit(req, 'stats', { days });
    return out;
  });

  app.get('/health', async () => db.ping());

  app.get('/export.csv', limit(RATE_LIMITS.admin), async (req, reply) => {
    if (!isAdmin(req)) { auditDenied(req, 'export_csv'); return reply.code(401).send({ error: 'unauthorized' }); }
    const { csv, rows, truncated } = await db.exportCsv();
    audit(req, 'export_csv', { rows, truncated });
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    // Усечение обязано быть видно из ответа, иначе оператор решит, что
    // получил полную выгрузку, и приметет по ней решение.
    if (truncated) reply.header('X-Hub-Export-Truncated', 'true');
    return csv;
  });

  // Ручной запуск retention — нужен оператору и для проверки срабатывания
  // политики до того, как сработает планировщик.
  app.post('/retention/run', limit(RATE_LIMITS.admin), async (req, reply) => {
    if (!isAdmin(req)) { auditDenied(req, 'retention_run'); return reply.code(401).send({ error: 'unauthorized' }); }
    const result = await db.purgeExpired();
    audit(req, 'retention_run', { rows: result.events + result.subscribers });
    return { ok: true, ...result };
  });

  return app;
}

/**
 * Планировщик retention. Отдельный таймер в процессе server, а не в обоих
 * процессах: purge идемпотентен и защищён advisory-локом в БД, но запускать
 * его из двух процессов незачем. Интервал по умолчанию — сутки; первый проход
 * откладывается на минуту, чтобы не мешать старту и healthcheck.
 */
function startRetentionScheduler(app) {
  if (process.env.HUB_RETENTION_DISABLED === 'true') return null;
  const hours = Math.max(1, Number(process.env.HUB_RETENTION_INTERVAL_HOURS) || 24);
  const run = async () => {
    try {
      const r = await db.purgeExpired();
      if (r.events || r.subscribers) {
        app.log?.info(JSON.stringify({
          ts: new Date().toISOString(), audit: 'retention_scheduled',
          removed: { events: r.events, subscribers: r.subscribers },
          policy: { events_days: r.eventsDays, subscribers_days: r.subscribersDays },
        }));
      }
    } catch (e) {
      // Ошибка retention не должна ронять процесс: данные переживут ещё цикл.
      app.log?.error({ err: e?.message || String(e) }, 'retention run failed');
    }
  };
  const timer = setInterval(run, hours * 3600000);
  timer.unref?.();
  const kickoff = setTimeout(run, 60000);
  kickoff.unref?.();
  return { timer, kickoff, run };
}

const isDirectRun = !!process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  try {
    assertProductionConfig();
    const PORT = Number(process.env.PORT || 8787);
    const app = await buildServer();
    startRetentionScheduler(app);
    const shutdown = async (signal) => {
      app.log?.info({ signal }, 'shutting down');
      try { await app.close(); } catch { /* уже закрыт */ }
      process.exit(0);
    };
    for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => void shutdown(sig));
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Сервер событий запущен на порту ${PORT} · хранилище: ${db.driver}`);
    console.log(`Политика хранения: события ${db.retentionPolicy().events} дн., подписчики ${db.retentionPolicy().subscribers} дн.`);
  } catch (e) {
    console.error(e?.message || e);
    process.exit(1);
  }
}
