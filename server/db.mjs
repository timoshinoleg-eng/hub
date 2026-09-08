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

const DDL = `
CREATE TABLE IF NOT EXISTS hub_events (
  id          bigserial PRIMARY KEY,
  uid_hash    varchar(32)  NOT NULL,
  session_id  varchar(64),
  game        varchar(32),
  action      varchar(48)  NOT NULL,
  value       integer,
  sp          varchar(64),
  ts          timestamptz  NOT NULL DEFAULT now()
);
ALTER TABLE hub_events ADD COLUMN IF NOT EXISTS session_id varchar(64);
CREATE INDEX IF NOT EXISTS hub_events_game_idx ON hub_events (game, action);
CREATE INDEX IF NOT EXISTS hub_events_session_idx ON hub_events (session_id, action);

CREATE TABLE IF NOT EXISTS hub_subscribers (
  user_id   bigint PRIMARY KEY,
  uid_hash  varchar(32) NOT NULL,
  game      varchar(32),
  chat_id   bigint,
  consent   boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

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

export async function init() {
  assertHashSalt();
  if (driver === 'pg') await pg.query(DDL);
  return driver;
}

export async function insertEvent({ uid_hash, session_id = null, game, action, value, sp }) {
  if (driver === 'json') {
    jsonDb.events.push({ uid_hash, session_id, game, action, value, sp, ts: new Date().toISOString() });
    if (jsonDb.events.length > 50000) jsonDb.events = jsonDb.events.slice(-50000);
    saveJson();
    return;
  }
  await pg.query(
    `INSERT INTO hub_events (uid_hash, session_id, game, action, value, sp) VALUES ($1,$2,$3,$4,$5,$6)`,
    [uid_hash, session_id || null, game || null, action, value ?? null, sp || '']
  );
}

export async function addSubscriber({ user_id, uid_hash, game, chat_id }) {
  if (driver === 'json') {
    if (!jsonDb.subscribers.some((s) => String(s.user_id) === String(user_id))) {
      jsonDb.subscribers.push({ user_id, uid_hash, game, chat_id, consent: true, created_at: new Date().toISOString() });
      saveJson();
      return true;
    }
    return false;
  }
  const r = await pg.query(
    `INSERT INTO hub_subscribers (user_id, uid_hash, game, chat_id)
     VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO NOTHING`,
    [user_id, uid_hash, game || null, chat_id || null]
  );
  return r.rowCount > 0;
}

export async function listSubscribers() {
  if (driver === 'json') return jsonDb.subscribers.filter((s) => s.consent);
  const r = await pg.query(`SELECT user_id, game, chat_id FROM hub_subscribers WHERE consent = true`);
  return r.rows;
}

export async function forgetUser(rawUserId) {
  const h = hashUid(rawUserId);
  if (driver === 'json') {
    jsonDb.subscribers = jsonDb.subscribers.filter((s) => String(s.user_id) !== String(rawUserId));
    jsonDb.events = jsonDb.events.filter((e) => e.uid_hash !== h);
    saveJson();
    return true;
  }
  await pg.query(`DELETE FROM hub_subscribers WHERE user_id = $1`, [rawUserId]);
  await pg.query(`DELETE FROM hub_events WHERE uid_hash = $1`, [h]);
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
    const events = cutoff
      ? jsonDb.events.filter((e) => Number.isFinite(Date.parse(e.ts)) && Date.parse(e.ts) >= cutoff)
      : jsonDb.events;
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
    counts.funnel = buildFunnel(counts, nextDayReturns, sessionStatsFromEvents(events));
    counts.game_funnel = gameFunnelFromEvents(events);
    return counts;
  }

  const where = days ? `ts >= now() - ($1::int * interval '1 day')` : 'TRUE';
  const params = days ? [days] : [];
  const r = await pg.query(`SELECT action, count(*)::int AS n FROM hub_events WHERE ${where} GROUP BY action`, params);
  const g = await pg.query(`
    SELECT game, count(*)::int AS n FROM hub_events WHERE ${where} AND game IS NOT NULL GROUP BY game ORDER BY n DESC
  `, params);
  const gf = await pg.query(`
    SELECT game, action, count(*)::int AS n FROM hub_events
    WHERE ${where} AND game IS NOT NULL AND action IN ('open_game','finish','replay','share_ok')
    GROUP BY game, action
  `, params);
  const nd = await pg.query(`
    SELECT count(*)::int AS n FROM hub_events
    WHERE ${where} AND action = 'return_visit' AND value = 1
  `, params);
  const sm = await pg.query(`
    WITH scoped AS (SELECT session_id, action FROM hub_events WHERE ${where}),
    opens AS (SELECT DISTINCT session_id FROM scoped WHERE action = 'open_bot' AND session_id IS NOT NULL)
    SELECT
      (SELECT count(*)::int FROM opens) AS open_sessions,
      count(DISTINCT session_id) FILTER (WHERE action = 'open_game' AND session_id IN (SELECT session_id FROM opens))::int AS game_sessions,
      count(DISTINCT session_id) FILTER (WHERE action = 'first_visit' AND session_id IN (SELECT session_id FROM opens))::int AS first_visit_sessions,
      count(DISTINCT session_id) FILTER (WHERE action = 'return_visit' AND session_id IN (SELECT session_id FROM opens))::int AS returning_sessions
    FROM scoped
  `, params);
  const s = await pg.query(`SELECT count(*)::int AS n FROM hub_subscribers WHERE consent = true`);

  const out = { subscribers: s.rows[0].n, games: {}, window_days: days };
  for (const a of KEY_ACTIONS) out[a] = 0;
  for (const row of r.rows) out[row.action] = row.n;
  for (const row of g.rows) out.games[row.game] = row.n;
  const sessionStats = Number(sm.rows[0]?.open_sessions || 0) > 0 ? sm.rows[0] : null;
  out.funnel = buildFunnel(out, nd.rows[0]?.n || 0, sessionStats);
  out.game_funnel = gameFunnelFromRows(gf.rows);
  return out;
}

export async function exportCsv() {
  const rows = driver === 'json'
    ? jsonDb.events
    : (await pg.query(`SELECT * FROM hub_events ORDER BY ts`)).rows;
  if (!rows.length) return '';
  const head = ['ts', 'uid_hash', 'session_id', 'game', 'action', 'value', 'sp'].join(',');
  return [head, ...rows.map((r) => [r.ts, r.uid_hash, r.session_id, r.game, r.action, r.value, r.sp]
    .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
}

export async function ping() {
  if (driver === 'json') return { driver, events: jsonDb.events.length };
  await pg.query('SELECT 1');
  return { driver, events: (await pg.query('SELECT count(*)::int AS n FROM hub_events')).rows[0].n };
}
