#!/usr/bin/env node
/**
 * Сервер событий. Fastify + Postgres (или JSON-файл при отсутствии DATABASE_URL).
 *
 * Эндпоинты:
 *   POST /ev     — событие от хаба
 *   POST /sub    — подписка на «уведомить о запуске»
 *   POST /forget — удаление данных пользователя (152-ФЗ)
 *   GET  /stats  — метрики софт-лонча
 *   GET  /export.csv
 *   GET  /health
 *
 * Запуск:  node server/index.mjs
 * Переменные: PORT, DATABASE_URL, HUB_HASH_SALT, HUB_CORS_ORIGIN
 */
import Fastify from 'fastify';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.mjs';

/**
 * Собирает приложение, но не слушает порт. Запуск — в конце файла, только при
 * прямом вызове. Так server/smoke.mjs гоняет запросы через app.inject()
 * без порта и без сети.
 */
export async function buildServer({ logger = true } = {}) {
  await db.init();
  const app = Fastify(
    logger ? { logger: { transport: { target: 'pino-pretty', options: { translateTime: true } } } } : {}
  );

  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', process.env.HUB_CORS_ORIGIN || '*');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  const clamp = (s, n) => String(s ?? '').slice(0, n);
  const isAction = (s) => /^[a-z_]{2,32}$/.test(String(s || ''));
  const isGame = (s) => /^[a-z]{2,16}$/.test(String(s || ''));

  app.post('/ev', async (req, reply) => {
    const b = req.body || {};
    if (!isAction(b.action)) return reply.code(400).send({ error: 'bad action' });

    // Сырой user_id из мини-приложения сюда не попадает вообще: хаб шлёт
    // уже хешированный идентификатор. Если пришло что-то длинное — хешируем.
    const uid_hash = /^[a-f0-9]{32}$/.test(b.uid_hash || '')
      ? b.uid_hash
      : db.hashUid(b.uid_hash || db.anonId());

    await db.insertEvent({
      uid_hash,
      game: isGame(b.game) ? b.game : null,
      action: b.action,
      value: Number.isFinite(Number(b.value)) ? Number(b.value) : null,
      sp: clamp(b.sp, 64),
    });
    return { ok: true };
  });

  app.post('/sub', async (req, reply) => {
    const b = req.body || {};
    const user_id = Number(b.user_id);
    if (!Number.isFinite(user_id)) return reply.code(400).send({ error: 'bad user_id' });
    if (b.consent === false) return reply.code(200).send({ ok: true, subscribed: false });

    const added = await db.addSubscriber({
      user_id,
      uid_hash: db.hashUid(user_id),
      game: isGame(b.game) ? b.game : null,
      chat_id: Number.isFinite(Number(b.chat_id)) ? Number(b.chat_id) : null,
    });
    return { ok: true, subscribed: added };
  });

  app.post('/forget', async (req, reply) => {
    const user_id = Number((req.body || {}).user_id);
    if (!Number.isFinite(user_id)) return reply.code(400).send({ error: 'bad user_id' });
    await db.forgetUser(user_id);
    return { ok: true };
  });

  app.get('/stats', async () => db.stats());
  app.get('/health', async () => db.ping());

  app.get('/export.csv', async (req, reply) => {
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    return db.exportCsv();
  });

  return app;
}

/* ── Запуск ────────────────────────────────────────────────────────────── */

// Сравнение с учётом регистра буквы диска и относительных путей в argv[1].
const isDirectRun = !!process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const PORT = Number(process.env.PORT || 8787);
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Сервер событий: http://127.0.0.1:${PORT} · хранилище: ${db.driver}`);
  } catch (e) {
    app.log.error(e);
    process.exit(1);
  }
}
