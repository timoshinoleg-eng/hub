#!/usr/bin/env node
/**
 * Проверка сервера событий без порта и без сети: запросы идут через app.inject().
 *
 * Зачем: /ev принимает данные из внешнего мира, а /forget — обязанность по
 * 152-ФЗ. Ошибка в валидации здесь означает либо мусор в аналитике, либо
 * невыполнимое обещание «удалить данные по запросу».
 *
 * Запуск:  node server/smoke.mjs
 */
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DB = join(ROOT, 'server', '.smoke-srv.json');

process.env.HUB_JSON_DB = TMP_DB;
process.env.HUB_HASH_SALT = 'smoke-salt';
process.env.HUB_CORS_ORIGIN = 'https://hub.example.ru';
rmSync(TMP_DB, { force: true });

const db = await import('./db.mjs');
const { buildServer } = await import('./index.mjs');

const app = await buildServer({ logger: false });
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

const post = (path, body) => app.inject({ method: 'POST', url: path, payload: body });
const get = (path) => app.inject({ method: 'GET', url: path });
const json = (r) => JSON.parse(r.body || '{}');

/* ── События ───────────────────────────────────────────────────────────── */

const H = 'a'.repeat(32);

let r = await post('/ev', { action: 'open_game', game: 'merge', value: 120, uid_hash: H });
check('POST /ev принимает событие', r.statusCode === 200 && json(r).ok);

r = await post('/ev', { action: 'finish', game: 'merge', value: 340, sp: 'gmerge_s340' });
check('/ev без uid_hash подставляет анонимный id', r.statusCode === 200, `код ${r.statusCode}`);

r = await post('/ev', { action: '<script>alert(1)</script>' });
check('/ev отклоняет мусор в action', r.statusCode === 400, `код ${r.statusCode}`);

r = await post('/ev', { action: 'open_game', game: '../../etc/passwd' });
check('/ev отбрасывает мусор в game', r.statusCode === 200);
const afterBad = json(await get('/stats'));
check('мусорное имя игры не попало в метрики', !('../../etc/passwd' in (afterBad.games || {})), JSON.stringify(afterBad.games));

r = await post('/ev', { action: 'open_game', game: 'merge', value: 'не число' });
check('/ev терпит нечисловое value', r.statusCode === 200, `код ${r.statusCode}`);

/* ── Подписки ──────────────────────────────────────────────────────────── */

r = await post('/sub', { user_id: 555, game: 'merge' });
check('POST /sub записывает подписчика', json(r).subscribed === true, r.body);

r = await post('/sub', { user_id: 555, game: 'merge' });
check('повторная подписка не дублируется', json(r).subscribed === false, r.body);

r = await post('/sub', { user_id: 'не число' });
check('/sub отклоняет мусорный user_id', r.statusCode === 400, `код ${r.statusCode}`);

r = await post('/sub', { user_id: 777, consent: false });
check('/sub уважает отказ от согласия', json(r).subscribed === false && (await db.listSubscribers()).length === 1, r.body);

/* ── CORS ──────────────────────────────────────────────────────────────── */

r = await app.inject({ method: 'OPTIONS', url: '/ev' });
check(
  'OPTIONS отдаёт разрешённый источник',
  r.headers['access-control-allow-origin'] === 'https://hub.example.ru',
  String(r.headers['access-control-allow-origin'])
);

/* ── Метрики ───────────────────────────────────────────────────────────── */

const stats = json(await get('/stats'));
check('/stats показывает все ключевые действия', ['bot_start', 'open_game', 'finish', 'share_ok', 'notify_subscribe']
  .every((k) => typeof stats[k] === 'number'), JSON.stringify(stats));
// Три события open_game: первое, с мусорным именем игры и с нечисловым value.
check('/stats считает события', stats.open_game === 3 && stats.finish === 1, `open_game=${stats.open_game} finish=${stats.finish}`);
check('/stats показывает подписчиков', stats.subscribers === 1, `subscribers=${stats.subscribers}`);

r = await get('/export.csv');
check('/export.csv отдаёт CSV с заголовком', r.body.startsWith('ts,uid_hash,game,action,value,sp'), r.body.slice(0, 40));
check('/export.csv не содержит сырого user_id', !r.body.includes('555'), 'сырой id в выгрузке');
check('/export.csv содержит хеш', r.body.includes(H), 'хеш потерян');

/* ── Удаление данных (152-ФЗ) ──────────────────────────────────────────── */

r = await post('/forget', { user_id: 555 });
check('POST /forget отвечает ok', r.statusCode === 200 && json(r).ok);
check('/forget удаляет подписчика', (await db.listSubscribers()).length === 0, `осталось ${(await db.listSubscribers()).length}`);
const csvAfterForget = (await get('/export.csv')).body;
check('/forget стирает события пользователя', !csvAfterForget.includes(db.hashUid(555)), 'события остались');

/* ── Итог ──────────────────────────────────────────────────────────────── */

await app.close();
rmSync(TMP_DB, { force: true });

console.log('--- Проверки ---');
for (const x of results) console.log(`${x.ok ? '✓' : '✗'} ${x.name}${!x.ok && x.detail ? ' → ' + x.detail : ''}`);

const failed = results.filter((x) => !x.ok).length;
if (failed) {
  console.error(`\nПровалено: ${failed} из ${results.length}.`);
  process.exit(1);
}
console.log(`\nВсе ${results.length} проверок прошли.`);
