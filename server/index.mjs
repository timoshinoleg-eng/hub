#!/usr/bin/env node
/** Сервер событий: анонимная аналитика + authenticated MAX subscriptions. */
import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.mjs';
import { verifyMaxInitData } from './max-auth.mjs';

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
  if (problems.length) throw new Error(`Unsafe production config: ${problems.join('; ')}`);
}

export async function buildServer({ logger = true } = {}) {
  await db.init();
  const opts = { bodyLimit: 32 * 1024 };
  if (logger) opts.logger = { transport: { target: 'pino-pretty', options: { translateTime: true } } };
  const app = Fastify(opts);
  const corsOrigin = process.env.HUB_CORS_ORIGIN || '';

  app.addHook('onRequest', async (req, reply) => {
    if (corsOrigin && req.headers.origin === corsOrigin) {
      reply.header('Access-Control-Allow-Origin', corsOrigin);
      reply.header('Vary', 'Origin');
    }
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  const clamp = (s, n) => String(s ?? '').slice(0, n);
  const isAction = (s) => /^[a-z_]{2,32}$/.test(String(s || ''));
  const isGame = (s) => /^[a-z]{2,16}$/.test(String(s || ''));
  const verifyBody = (b) => verifyMaxInitData(typeof b?.init_data === 'string' ? b.init_data : '');
  const isAdmin = (req) => {
    const expected = process.env.HUB_ADMIN_TOKEN || '';
    const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    return safeEqual(got, expected);
  };

  app.post('/ev', async (req, reply) => {
    const b = req.body || {};
    if (!isAction(b.action)) return reply.code(400).send({ error: 'bad action' });
    let uid_hash = db.anonId();
    if (typeof b.init_data === 'string' && b.init_data) {
      const auth = verifyBody(b);
      if (!auth.ok) return reply.code(401).send({ error: 'bad init_data', reason: auth.reason });
      uid_hash = db.hashUid(auth.user.id);
    }
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
    if (b.consent !== true) return reply.code(400).send({ error: 'consent_required' });
    const auth = verifyBody(b);
    if (!auth.ok) return reply.code(401).send({ error: 'bad init_data', reason: auth.reason });
    const user_id = auth.user.id;
    const added = await db.addSubscriber({ user_id, uid_hash: db.hashUid(user_id), game: isGame(b.game) ? b.game : null, chat_id: null });
    return { ok: true, subscribed: added };
  });

  app.post('/forget', async (req, reply) => {
    const auth = verifyBody(req.body || {});
    if (!auth.ok) return reply.code(401).send({ error: 'bad init_data', reason: auth.reason });
    await db.forgetUser(auth.user.id);
    return { ok: true };
  });

  app.get('/stats', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(401).send({ error: 'unauthorized' });
    return db.stats();
  });
  app.get('/health', async () => db.ping());
  app.get('/export.csv', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(401).send({ error: 'unauthorized' });
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    return db.exportCsv();
  });
  return app;
}

const isDirectRun = !!process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  try {
    assertProductionConfig();
    const PORT = Number(process.env.PORT || 8787);
    const app = await buildServer();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Сервер событий: http://127.0.0.1:${PORT} · хранилище: ${db.driver}`);
  } catch (e) {
    console.error(e?.message || e);
    process.exit(1);
  }
}
