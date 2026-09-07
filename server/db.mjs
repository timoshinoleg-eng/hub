/**
 * Слой данных. Одно хранилище на сервер событий и бота — иначе рассылка
 * и аналитика разъедутся.
 *
 * Два бэкенда: Postgres (прод) и JSON-файл (софт-лонч без инфраструктуры).
 * Выбор по наличию DATABASE_URL.
 *
 * Про персональные данные: user_id из MAX — это персональные данные по 152-ФЗ.
 * Поэтому в событиях хранится только HMAC-хеш с солью из окружения, а сырой
 * id — отдельно и только в таблице подписок, где он нужен физически,
 * чтобы отправить сообщение. Так аналитику можно хранить долго, а
 * идентификаторы — удалить по первому запросу пользователя.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HASH_SALT = process.env.HUB_HASH_SALT || 'change-me-in-production';
const JSON_FILE = process.env.HUB_JSON_DB || join(ROOT, 'server', 'data.json');

let pg = null;
export const driver = process.env.DATABASE_URL ? 'pg' : 'json';

if (driver === 'pg') {
  const { Pool } = await import('pg');
  pg = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
}

/* ── Хеширование ───────────────────────────────────────────────────────── */

export const hashUid = (raw) =>
  createHmac('sha256', HASH_SALT).update(String(raw)).digest('hex').slice(0, 32);

export const anonId = () => 'a-' + createHash('sha256').update(randomUUID()).digest('hex').slice(0, 16);

/* ── Схема ─────────────────────────────────────────────────────────────── */

const DDL = `
CREATE TABLE IF NOT EXISTS hub_events (
  id        bigserial PRIMARY KEY,
  uid_hash  varchar(32)  NOT NULL,
  game      varchar(32),
  action    varchar(48)  NOT NULL,
  value     integer,
  sp        varchar(64),
  ts        timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hub_events_game_idx ON hub_events (game, action);

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
    try { jsonDb = JSON.parse(readFileSync(JSON_FILE, 'utf8')); } catch { /* начнём с пустого */ }
  }
}
function saveJson() {
  writeFileSync(JSON_FILE, JSON.stringify(jsonDb), 'utf8');
}
if (driver === 'json') loadJson();

export async function init() {
  if (driver === 'pg') await pg.query(DDL);
  return driver;
}

/* ── События ───────────────────────────────────────────────────────────── */

export async function insertEvent({ uid_hash, game, action, value, sp }) {
  if (driver === 'json') {
    jsonDb.events.push({ uid_hash, game, action, value, sp, ts: new Date().toISOString() });
    if (jsonDb.events.length > 50000) jsonDb.events = jsonDb.events.slice(-50000);
    saveJson();
    return;
  }
  await pg.query(
    `INSERT INTO hub_events (uid_hash, game, action, value, sp) VALUES ($1,$2,$3,$4,$5)`,
    [uid_hash, game || null, action, value ?? null, sp || '']
  );
}

/* ── Подписки на уведомление о запуске ─────────────────────────────────── */

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

/** Удаление по запросу пользователя — обязанность по 152-ФЗ. */
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

/* ── Метрики софт-лонча ────────────────────────────────────────────────── */

/**
 * Действия, которые должны присутствовать в ответе даже с нулём —
 * иначе сводка молча теряет их и метрика выглядит как «не работает».
 */
const KEY_ACTIONS = [
  'bot_start',
  'open_bot',
  'open_game',
  'finish',
  'share_ok',
  'notify_subscribe',
  'bot_pick_game',
];

export async function stats() {
  if (driver === 'json') {
    const counts = {};
    const games = {};
    for (const e of jsonDb.events) {
      counts[e.action] = (counts[e.action] || 0) + 1;
      if (e.game) games[e.game] = (games[e.game] || 0) + 1;
    }
    for (const a of KEY_ACTIONS) if (counts[a] === undefined) counts[a] = 0;
    counts.subscribers = jsonDb.subscribers.filter((s) => s.consent).length;
    counts.games = games;
    return counts;
  }
  const r = await pg.query(`
    SELECT action, count(*)::int AS n FROM hub_events GROUP BY action
  `);
  const g = await pg.query(`
    SELECT game, count(*)::int AS n FROM hub_events WHERE game IS NOT NULL GROUP BY game ORDER BY n DESC
  `);
  const s = await pg.query(`SELECT count(*)::int AS n FROM hub_subscribers WHERE consent = true`);
  const out = { subscribers: s.rows[0].n, games: {} };
  for (const a of KEY_ACTIONS) out[a] = 0;
  for (const row of r.rows) out[row.action] = row.n;
  for (const row of g.rows) out.games[row.game] = row.n;
  return out;
}

export async function exportCsv() {
  const rows = driver === 'json'
    ? jsonDb.events
    : (await pg.query(`SELECT * FROM hub_events ORDER BY ts`)).rows;
  if (!rows.length) return '';
  const head = ['ts', 'uid_hash', 'game', 'action', 'value', 'sp'].join(',');
  return [head, ...rows.map((r) => [r.ts, r.uid_hash, r.game, r.action, r.value, r.sp]
    .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
}

export async function ping() {
  if (driver === 'json') return { driver, events: jsonDb.events.length };
  await pg.query('SELECT 1');
  return { driver, events: (await pg.query('SELECT count(*)::int AS n FROM hub_events')).rows[0].n };
}
