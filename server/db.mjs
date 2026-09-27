/**
 * Слой данных. Postgres — production; JSON — только dev/test.
 * В событиях хранится HMAC-псевдоним только после подтверждённой identity;
 * анонимные события получают случайный несвязуемый id.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HASH_SALT = process.env.HUB_HASH_SALT || '';
const JSON_FILE = process.env.HUB_JSON_DB || join(ROOT, 'server', 'data.json');

let pg = null;
export const driver = process.env.DATABASE_URL ? 'pg' : 'json';

if (driver === 'pg') {
  const { Pool } = await import('pg');
  pg = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
}

function assertHashSalt() {
  if (!HASH_SALT || HASH_SALT === 'change-me-in-production' || HASH_SALT.length < 32) {
    throw new Error('HUB_HASH_SALT must be a non-default secret of at least 32 characters');
  }
}

export const hashUid = (raw) =>
  createHmac('sha256', HASH_SALT).update(String(raw)).digest('hex').slice(0, 32);

export const anonId = () => 'a-' + createHash('sha256').update(randomUUID()).digest('hex').slice(0, 16);

/**
 * Политика хранения.
 *
 * До этого сроки существовали только как плейсхолдер в legal/POLICY.md, а код
 * ничего не удалял: таблица событий росла бесконечно. Это одновременно
 * операционная и правовая проблема — 152-ФЗ требует ограничения срока хранения.
 *
 * Значения по умолчанию осознанно консервативны и соответствуют окну, которое
 * SUPPORTED_LAUNCH_KPI использует для продуктовых решений (90 дней — верхняя
 * граница допустимого окна /stats). Увеличение требует явного env, а не тихой
 * правки константы.
 */
const RETENTION = {
  events: Number(process.env.HUB_EVENT_RETENTION_DAYS ?? 90),
  subscribers: Number(process.env.HUB_SUBSCRIBER_RETENTION_DAYS ?? 365),
};
export const retentionPolicy = () => ({ ...RETENTION });

const DDL = `
CREATE TABLE IF NOT EXISTS hub_events (
  id          bigserial PRIMARY KEY,
  uid_hash    varchar(32)  NOT NULL,
  session_id  varchar(64),
  game        varchar(32),
  action      varchar(48)  NOT NULL,
  value       integer,
  sp          varchar(64),
  verified    boolean     NOT NULL DEFAULT false,
  ts          timestamptz  NOT NULL DEFAULT now()
);
ALTER TABLE hub_events ADD COLUMN IF NOT EXISTS session_id varchar(64);
ALTER TABLE hub_events ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS hub_events_game_idx ON hub_events (game, action);
CREATE INDEX IF NOT EXISTS hub_events_session_idx ON hub_events (session_id, action);
-- Индекс по ts обязателен: /stats?days=N и retention-очистка работают как
-- диапазонные выборки, а /health больше не делает count(*) по всей таблице.
CREATE INDEX IF NOT EXISTS hub_events_ts_idx ON hub_events (ts);
-- Воронка строится только по подписанным событиям, поэтому partial index
-- заметно меньше полного и не растёт от неподписанного шума.
CREATE INDEX IF NOT EXISTS hub_events_verified_idx ON hub_events (action, session_id) WHERE verified;

CREATE TABLE IF NOT EXISTS hub_subscribers (
  user_id      bigint PRIMARY KEY,
  uid_hash     varchar(32) NOT NULL,
  game         varchar(32),
  chat_id      bigint,
  consent      boolean     NOT NULL DEFAULT true,
  -- Текст согласия, на который подписчик ответил. Без этого доказать
  -- согласие нельзя: смена формулировки политики не должна молча обесценить
  -- ранее собранное согласие.
  consent_text varchar(64),
  consent_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Последний фактический контакт: повторная подписка или доставка уведомления.
  -- По нему считается просрочка подписчика, а не по created_at, иначе
  -- политика молча отключала бы уведомления у всех давно подписанных.
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hub_subscribers ADD COLUMN IF NOT EXISTS consent_text varchar(64);
ALTER TABLE hub_subscribers ADD COLUMN IF NOT EXISTS consent_at timestamptz;
ALTER TABLE hub_subscribers ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS hub_subscribers_consent_idx ON hub_subscribers (consent) WHERE consent;
`;

/** Идентификатор версии текста согласия, попадающего в запись подписчика. */
export const CONSENT_TEXT_ID = 'notify-2026-09';

let jsonDb = { events: [], subscribers: [] };

function loadJson() {
  if (existsSync(JSON_FILE)) {
    try { jsonDb = JSON.parse(readFileSync(JSON_FILE, 'utf8')); } catch { /* dev: начнём с пустого */ }
  }
}
function saveJson() {
  writeFileSync(JSON_FILE, JSON.stringify(jsonDb), 'utf8');
}
if (driver === 'json') loadJson();

/**
 * Advisory-ключ для DDL и retention.
 *
 * server и bot стартуют отдельными процессами и оба выполняют DDL при старте.
 * В Postgres два одновременных `CREATE TABLE IF NOT EXISTS` одной таблицы могут
 * упасть с duplicate key по `pg_type_typname_nsp_index` (SQLSTATE 23505):
 * IF NOT EXISTS проверяет каталог, а не ставит блокировку на создание. Advisory
 * lock сериализует DDL и retention между процессами, retry добивает оставшуюся
 * гонку с другими инструментами.
 */
const DDL_LOCK_KEY = 727_115_001;

async function withLock(fn) {
  if (driver !== 'pg') return fn();
  const client = await pg.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [DDL_LOCK_KEY]);
    return await fn(client);
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [DDL_LOCK_KEY]); } catch { /* сессия уже закрыта */ }
    client.release();
  }
}

/** Ошибки гонки создания объекта в Postgres: повторять безопасно. */
const RETRYABLE = new Set(['23505', '42P07', '42710']);

function isRetryable(err) {
  return RETRYABLE.has(err?.code);
}

export async function init() {
  assertHashSalt();
  if (driver !== 'pg') return driver;
  await withLock(async (client) => {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await client.query(DDL);
        return;
      } catch (err) {
        if (!isRetryable(err)) throw err;
        lastErr = err;
        // Небольшая пауза: гонка обычно разрешается за один-два запроса.
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
      }
    }
    throw lastErr;
  });
  return driver;
}

/**
 * Удаление просроченных данных.
 *
 * События — по retention.events. Подписчики — по последнему фактическому
 * обращению, а не только по дате подписки: иначе политика молча отключала бы
 * уведомления у всех, кто подписался год назад, без возможности переподписаться
 * из интерфейса. Ссылка на последний контакт — колонка last_seen_at, которую
 * обновляет и повторная подписка, и фактическая доставка уведомления.
 *
 * Отозванные подписки (consent = false) удаляются независимо от last_seen_at:
 * отзыв — это требование удалить, а не «перестать использовать».
 *
 * Возвращает фактические количества, чтобы вызов можно было залогировать.
 */
export async function purgeExpired({ now = new Date() } = {}) {
  const result = { events: 0, subscribers: 0, eventsDays: RETENTION.events, subscribersDays: RETENTION.subscribers };
  if (!Number.isFinite(RETENTION.events) || !Number.isFinite(RETENTION.subscribers)) return result;

  if (driver === 'json') {
    const cutoff = (days) => Date.parse(new Date(now.getTime() - days * 86400000).toISOString());
    const evCut = cutoff(RETENTION.events);
    const subCut = cutoff(RETENTION.subscribers);
    const before = jsonDb.events.length;
    jsonDb.events = jsonDb.events.filter((e) => Date.parse(e.ts) >= evCut);
    result.events = before - jsonDb.events.length;
    const subsBefore = jsonDb.subscribers.length;
    jsonDb.subscribers = jsonDb.subscribers.filter((s) => {
      if (s.consent === false) return Date.parse(s.created_at) >= subCut;
      return Math.max(Date.parse(s.created_at), Date.parse(s.last_seen_at || s.created_at)) >= subCut;
    });
    result.subscribers = subsBefore - jsonDb.subscribers.length;
    if (result.events || result.subscribers) saveJson();
    return result;
  }

  await withLock(async (client) => {
    const ev = await client.query(
      `DELETE FROM hub_events WHERE ts < now() - ($1::int * interval '1 day')`, [RETENTION.events]);
    result.events = ev.rowCount || 0;
    const sub = await client.query(
      `DELETE FROM hub_subscribers
       WHERE (NOT consent AND created_at < now() - ($1::int * interval '1 day'))
          OR (consent AND greatest(created_at, coalesce(last_seen_at, created_at))
              < now() - ($1::int * interval '1 day'))`,
      [RETENTION.subscribers]);
    result.subscribers = sub.rowCount || 0;
  });
  return result;
}

export async function insertEvent({ uid_hash, session_id = null, game, action, value, sp, verified = false }) {
  if (driver === 'json') {
    jsonDb.events.push({ uid_hash, session_id, game, action, value, sp, verified: !!verified, ts: new Date().toISOString() });
    if (jsonDb.events.length > 50000) jsonDb.events = jsonDb.events.slice(-50000);
    saveJson();
    return;
  }
  await pg.query(
    `INSERT INTO hub_events (uid_hash, session_id, game, action, value, sp, verified) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [uid_hash, session_id || null, game || null, action, value ?? null, sp || '', !!verified]
  );
}

/**
 * Подписка. Фиксирует версию текста согласия и момент согласия: без этого
 * нельзя доказать, на какую формулировку человек ответил «да». Повторная
 * подписка обновляет last_seen_at, поэтому retention считается по реальному
 * последнему контакту.
 */
export async function addSubscriber({ user_id, uid_hash, game, chat_id, consentText = CONSENT_TEXT_ID }) {
  if (driver === 'json') {
    const now = new Date().toISOString();
    const existing = jsonDb.subscribers.find((s) => String(s.user_id) === String(user_id));
    if (existing) {
      existing.last_seen_at = now;
      existing.consent = true;
      saveJson();
      return false;
    }
    jsonDb.subscribers.push({
      user_id, uid_hash, game, chat_id, consent: true,
      consent_text: consentText, consent_at: now, created_at: now, last_seen_at: now,
    });
    saveJson();
    return true;
  }
  const r = await pg.query(
    `INSERT INTO hub_subscribers (user_id, uid_hash, game, chat_id, consent_text, consent_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (user_id) DO UPDATE
       SET last_seen_at = now(), consent = true, consent_text = $5, consent_at = now(),
           uid_hash = EXCLUDED.uid_hash, game = COALESCE(EXCLUDED.game, hub_subscribers.game),
           chat_id = COALESCE(EXCLUDED.chat_id, hub_subscribers.chat_id)`,
    [user_id, uid_hash, game || null, chat_id || null, consentText]
  );
  // rowCount = 1 и при вставке, и при обновлении: различаем по created_at.
  const created = await pg.query(
    `SELECT (created_at = consent_at) AS fresh FROM hub_subscribers WHERE user_id = $1`, [user_id]);
  return created.rows[0]?.fresh === true;
}

export async function listSubscribers() {
  if (driver === 'json') return jsonDb.subscribers.filter((s) => s.consent);
  return (await pg.query(
    `SELECT user_id, game, chat_id FROM hub_subscribers WHERE consent = true ORDER BY user_id`)).rows;
}

/**
 * Отзыв согласия без удаления. Данные очищаются от событий, но запись
 * подписчика помечается отозванной, чтобы доказать, что отзыв был, и не
 * считать человека активным подписчиком.
 */
export async function revokeSubscriber(rawUserId) {
  if (driver === 'json') {
    const s = jsonDb.subscribers.find((x) => String(x.user_id) === String(rawUserId));
    if (!s) return false;
    s.consent = false;
    saveJson();
    return true;
  }
  const r = await pg.query(
    `UPDATE hub_subscribers SET consent = false WHERE user_id = $1 AND consent = true`, [rawUserId]);
  return (r.rowCount || 0) > 0;
}

/** Фиксирует факт доставки уведомления, чтобы продлить окно подписки. */
export async function touchSubscribers(userIds) {
  if (!userIds?.length) return;
  if (driver === 'json') {
    const set = new Set(userIds.map(String));
    for (const s of jsonDb.subscribers) if (set.has(String(s.user_id))) s.last_seen_at = new Date().toISOString();
    saveJson();
    return;
  }
  await pg.query(`UPDATE hub_subscribers SET last_seen_at = now() WHERE user_id = ANY($1::bigint[])`, [userIds]);
}

export async function forgetUser(rawUserId) {
  const h = hashUid(rawUserId);
  if (driver === 'json') {
    jsonDb.subscribers = jsonDb.subscribers.filter((s) => String(s.user_id) !== String(rawUserId));
    jsonDb.events = jsonDb.events.filter((e) => e.uid_hash !== h);
    saveJson();
    return true;
  }
  // Порядок в одной транзакции: удаление подписчика и его событий не должно
  // оставлять промежуточное состояние, где user_id удалён, а события — нет.
  const client = await pg.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM hub_subscribers WHERE user_id = $1`, [rawUserId]);
    await client.query(`DELETE FROM hub_events WHERE uid_hash = $1`, [h]);
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* соединение уже потеряно */ }
    throw err;
  } finally {
    client.release();
  }
  return true;
}

const KEY_ACTIONS = [
  'bot_start', 'open_bot', 'first_visit', 'return_visit', 'open_game', 'finish',
  'replay', 'share_ok', 'new_record', 'daily_complete', 'notify_subscribe', 'bot_pick_game',
];

const pct = (n, d) => d > 0 ? Math.round((Number(n || 0) / Number(d)) * 1000) / 10 : 0;

function buildFunnel(counts, nextDayReturns = 0, sessionStats = null) {
  const eventOpens = Number(counts.open_bot || 0);
  const starts = Number(counts.open_game || 0);
  const finishes = Number(counts.finish || 0);
  const replays = Number(counts.replay || 0);
  const shares = Number(counts.share_ok || 0);
  const daily = Number(counts.daily_complete || 0);
  const opens = sessionStats ? Number(sessionStats.open_sessions || 0) : eventOpens;
  const gameSessions = sessionStats ? Number(sessionStats.game_sessions || 0) : Math.min(starts, opens);
  const firstSessions = sessionStats ? Number(sessionStats.first_visit_sessions || 0) : Number(counts.first_visit || 0);
  const returningSessions = sessionStats ? Number(sessionStats.returning_sessions || 0) : Number(counts.return_visit || 0);
  return {
    open_sessions: opens,
    sessions_with_game: gameSessions,
    first_visit_sessions: firstSessions,
    returning_sessions: returningSessions,
    next_day_return_events: Number(nextDayReturns || 0),
    game_starts: starts,
    finishes,
    replays,
    shares,
    daily_completions: daily,
    start_rate_pct: pct(gameSessions, opens),
    completion_rate_pct: pct(finishes, starts),
    finish_per_open_pct: pct(finishes, opens),
    replay_rate_pct: pct(replays, finishes),
    share_rate_pct: pct(shares, finishes),
    returning_session_share_pct: pct(returningSessions, opens),
    daily_completion_share_pct: pct(daily, opens),
  };
}

function emptyGameFunnel() {
  return { starts: 0, finishes: 0, replays: 0, shares: 0, completion_rate_pct: 0, replay_rate_pct: 0, share_rate_pct: 0 };
}

function finalizeGameFunnel(out) {
  for (const v of Object.values(out)) {
    v.completion_rate_pct = pct(v.finishes, v.starts);
    v.replay_rate_pct = pct(v.replays, v.finishes);
    v.share_rate_pct = pct(v.shares, v.finishes);
  }
  return out;
}

function gameFunnelFromEvents(events) {
  const out = {};
  for (const e of events) {
    if (!e.game || !['open_game', 'finish', 'replay', 'share_ok'].includes(e.action)) continue;
    const v = out[e.game] ||= emptyGameFunnel();
    if (e.action === 'open_game') v.starts++;
    else if (e.action === 'finish') v.finishes++;
    else if (e.action === 'replay') v.replays++;
    else if (e.action === 'share_ok') v.shares++;
  }
  return finalizeGameFunnel(out);
}

function gameFunnelFromRows(rows) {
  const out = {};
  for (const row of rows) {
    const v = out[row.game] ||= emptyGameFunnel();
    const n = Number(row.n || 0);
    if (row.action === 'open_game') v.starts = n;
    else if (row.action === 'finish') v.finishes = n;
    else if (row.action === 'replay') v.replays = n;
    else if (row.action === 'share_ok') v.shares = n;
  }
  return finalizeGameFunnel(out);
}

function sessionStatsFromEvents(events) {
  const opens = new Set(events.filter((e) => e.action === 'open_bot' && e.session_id).map((e) => e.session_id));
  if (!opens.size) return null;
  const inOpenSessions = (action) => new Set(events
    .filter((e) => e.action === action && e.session_id && opens.has(e.session_id))
    .map((e) => e.session_id)).size;
  return {
    open_sessions: opens.size,
    game_sessions: inOpenSessions('open_game'),
    first_visit_sessions: inOpenSessions('first_visit'),
    returning_sessions: inOpenSessions('return_visit'),
  };
}

function normalizedDays(days) {
  const n = Number(days);
  return Number.isInteger(n) && n >= 1 && n <= 90 ? n : 0;
}

export async function stats({ days = 0 } = {}) {
  days = normalizedDays(days);

  if (driver === 'json') {
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    const inWindow = cutoff
      ? jsonDb.events.filter((e) => Number.isFinite(Date.parse(e.ts)) && Date.parse(e.ts) >= cutoff)
      : jsonDb.events;
    // Воронка строится только по подписанным событиям. Неподписанные остаются
    // видимыми в unverified_events как диагностический счётчик, но не влияют
    // на KPI, по которым принимаются продуктовые решения.
    const events = inWindow.filter((e) => e.verified);
    const counts = {};
    const games = {};
    let nextDayReturns = 0;
    for (const e of events) {
      counts[e.action] = (counts[e.action] || 0) + 1;
      if (e.game) games[e.game] = (games[e.game] || 0) + 1;
      if (e.action === 'return_visit' && Number(e.value) === 1) nextDayReturns++;
    }
    for (const a of KEY_ACTIONS) if (counts[a] === undefined) counts[a] = 0;
    counts.subscribers = jsonDb.subscribers.filter((s) => s.consent).length;
    counts.games = games;
    counts.window_days = days;
    // Покрытие подписью — обязательный показатель доверия к воронке.
    // Клиент намеренно не передаёт signed initData до согласия (152-ФЗ,
    // POLICY.md §3), поэтому pre-consent трафик неподписан by design.
    counts.verified_events = events.length;
    counts.unverified_events = inWindow.length - events.length;
    counts.verified_share_pct = pct(events.length, inWindow.length);
    counts.funnel = buildFunnel(counts, nextDayReturns, sessionStatsFromEvents(events));
    counts.game_funnel = gameFunnelFromEvents(events);
    return counts;
  }

  const where = days ? `ts >= now() - ($1::int * interval '1 day')` : 'TRUE';
  const and = `${where} AND verified`;
  const params = days ? [days] : [];
  const r = await pg.query(`SELECT action, count(*)::int AS n FROM hub_events WHERE ${and} GROUP BY action`, params);
  const g = await pg.query(`
    SELECT game, count(*)::int AS n FROM hub_events WHERE ${and} AND game IS NOT NULL GROUP BY game ORDER BY n DESC
  `, params);
  const gf = await pg.query(`
    SELECT game, action, count(*)::int AS n FROM hub_events
    WHERE ${and} AND game IS NOT NULL AND action IN ('open_game','finish','replay','share_ok')
    GROUP BY game, action
  `, params);
  const nd = await pg.query(`
    SELECT count(*)::int AS n FROM hub_events
    WHERE ${and} AND action = 'return_visit' AND value = 1
  `, params);
  const sm = await pg.query(`
    WITH scoped AS (SELECT session_id, action FROM hub_events WHERE ${and}),
    opens AS (SELECT DISTINCT session_id FROM scoped WHERE action = 'open_bot' AND session_id IS NOT NULL)
    SELECT
      (SELECT count(*)::int FROM opens) AS open_sessions,
      (count(DISTINCT session_id) FILTER (WHERE action = 'open_game' AND session_id IN (SELECT session_id FROM opens)))::int AS game_sessions,
      (count(DISTINCT session_id) FILTER (WHERE action = 'first_visit' AND session_id IN (SELECT session_id FROM opens)))::int AS first_visit_sessions,
      (count(DISTINCT session_id) FILTER (WHERE action = 'return_visit' AND session_id IN (SELECT session_id FROM opens)))::int AS returning_sessions
    FROM scoped
  `, params);
  const s = await pg.query(`SELECT count(*)::int AS n FROM hub_subscribers WHERE consent = true`);
  const uv = await pg.query(
    `SELECT count(*)::int AS n FROM hub_events WHERE ${where} AND NOT verified`, params);
  const vTotal = Number(r.rows.reduce((n, row) => n + row.n, 0));

  const out = { subscribers: s.rows[0].n, games: {}, window_days: days, unverified_events: uv.rows[0].n };
  for (const a of KEY_ACTIONS) out[a] = 0;
  for (const row of r.rows) out[row.action] = row.n;
  for (const row of g.rows) out.games[row.game] = row.n;
  out.verified_events = vTotal;
  out.verified_share_pct = pct(vTotal, vTotal + Number(uv.rows[0].n));
  const sessionStats = Number(sm.rows[0]?.open_sessions || 0) > 0 ? sm.rows[0] : null;
  out.funnel = buildFunnel(out, nd.rows[0]?.n || 0, sessionStats);
  out.game_funnel = gameFunnelFromRows(gf.rows);
  return out;
}

/**
 * Ограничение выгрузки. Без него `SELECT *` без LIMIT отдавал всю таблицу
 * одним ответом: на реальном объёме это и память процесса, и ответ, который
 * оператору не нужен. Значение по умолчанию достаточно для разбора воронки;
 * увеличивать HUB_EXPORT_LIMIT осознанно.
 */
const EXPORT_LIMIT = Math.max(1, Math.min(Number(process.env.HUB_EXPORT_LIMIT) || 50000, 500000));

export async function exportCsv({ limit = EXPORT_LIMIT } = {}) {
  const cap = Math.max(1, Math.min(Number(limit) || EXPORT_LIMIT, 500000));
  const rows = driver === 'json'
    ? jsonDb.events.slice(-cap)
    : (await pg.query(
        `SELECT ts, uid_hash, session_id, game, action, value, sp, verified
         FROM hub_events ORDER BY ts DESC LIMIT $1`, [cap])).rows;
  if (!rows.length) return { csv: '', rows: 0, truncated: false };
  const head = ['ts', 'uid_hash', 'session_id', 'game', 'action', 'value', 'sp', 'verified'].join(',');
  const csv = [head, ...rows.map((r) => [r.ts, r.uid_hash, r.session_id, r.game, r.action, r.value, r.sp, r.verified]
    .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  return { csv, rows: rows.length, truncated: rows.length >= cap };
}

/**
 * Healthcheck.
 *
 * Раньше возвращал `count(*) FROM hub_events`, а этот же эндпоинт дёргается
 * docker healthcheck каждые 15 секунд: на растущей таблице это full scan каждые
 * 15 секунд. Теперь проверяется только живость соединения, а объём таблицы
 * берётся из pg_class — это метаданные, а не сканирование.
 */
export async function ping() {
  if (driver === 'json') return { driver, events: jsonDb.events.length, ok: true };
  const alive = await pg.query('SELECT 1');
  const size = await pg.query(
    `SELECT COALESCE((SELECT reltuples::bigint FROM pg_class WHERE relname = 'hub_events'), 0) AS n`);
  return { driver, events: Number(size.rows[0]?.n || 0), ok: alive.rows.length === 1, approximate: true };
}
