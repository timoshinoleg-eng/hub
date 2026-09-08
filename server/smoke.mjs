#!/usr/bin/env node
import { createHmac } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DB = join(ROOT, 'server', '.smoke-srv.json');
const BOT_TOKEN = 'smoke-bot-token';
const ADMIN_TOKEN = 'smoke-admin-token-0123456789';

process.env.HUB_JSON_DB = TMP_DB;
process.env.HUB_HASH_SALT = 'smoke-hash-salt-0123456789abcdef0123456789abcdef';
process.env.HUB_CORS_ORIGIN = 'https://hub.example.ru';
process.env.BOT_TOKEN = BOT_TOKEN;
process.env.HUB_ADMIN_TOKEN = ADMIN_TOKEN;
rmSync(TMP_DB, { force: true });

function initData(userId, { age = 0, tamper = false } = {}) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000) - age), query_id: `q-${userId}`, user: JSON.stringify({ id: userId, first_name: 'Test' }) };
  const launch = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(launch).digest('hex');
  return new URLSearchParams({ ...fields, hash: tamper ? '0'.repeat(64) : hash }).toString();
}

const db = await import('./db.mjs');
const { buildServer } = await import('./index.mjs');
const app = await buildServer({ logger: false });
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const post = (path, body, headers = {}) => app.inject({ method: 'POST', url: path, payload: body, headers });
const get = (path, headers = {}) => app.inject({ method: 'GET', url: path, headers });
const json = (r) => JSON.parse(r.body || '{}');
const admin = { authorization: `Bearer ${ADMIN_TOKEN}` };
const S1 = 's_smoke_session_001';
const S2 = 's_smoke_session_002';

let r = await app.inject({
  method: 'POST', url: '/ev',
  payload: JSON.stringify({ action: 'open_bot', sid: S1 }),
  headers: { 'content-type': 'text/plain;charset=UTF-8', origin: 'https://hub.example.ru' },
});
check('/ev принимает browser-like text/plain beacon', r.statusCode === 200 && json(r).ok, r.body);
await post('/ev', { action: 'first_visit', sid: S1 });
await post('/ev', { action: 'open_game', game: 'merge', sid: S1 });
await post('/ev', { action: 'open_game', game: 'merge', sid: S1 });
await post('/ev', { action: 'finish', game: 'merge', value: 340, sid: S1 });
await post('/ev', { action: 'replay', game: 'merge', value: 340, sid: S1 });
await post('/ev', { action: 'share_ok', game: 'merge', value: 340, sid: S1 });
await post('/ev', { action: 'open_bot', sid: S2 });
await post('/ev', { action: 'return_visit', value: 1, sid: S2 });

const signed555 = initData(555);
r = await post('/ev', { action: 'new_record', game: 'merge', value: 400, sid: S1, init_data: signed555 });
check('/ev принимает валидированный MAX event', r.statusCode === 200, r.body);
r = await post('/ev', { action: 'finish', init_data: initData(555, { tamper: true }) });
check('/ev отклоняет поддельный initData', r.statusCode === 401, `код ${r.statusCode}`);
r = await post('/ev', { action: '<script>alert(1)</script>' });
check('/ev отклоняет мусор в action', r.statusCode === 400, `код ${r.statusCode}`);

r = await post('/sub', { init_data: signed555, game: 'merge' });
check('/sub fail-closed без consent=true', r.statusCode === 400, r.body);
r = await post('/sub', { init_data: signed555, game: 'merge', consent: true, user_id: 999 });
check('/sub берёт identity из initData, а не user_id body', json(r).subscribed === true, r.body);
const subs = await db.listSubscribers();
check('/sub записал подписанного пользователя', subs.length === 1 && Number(subs[0].user_id) === 555, JSON.stringify(subs));
r = await post('/sub', { init_data: initData(777, { tamper: true }), consent: true });
check('/sub отклоняет поддельный initData', r.statusCode === 401, `код ${r.statusCode}`);

r = await app.inject({ method: 'OPTIONS', url: '/ev', headers: { origin: 'https://hub.example.ru' } });
check('CORS разрешает только настроенный origin', r.headers['access-control-allow-origin'] === 'https://hub.example.ru');
check('CORS поддерживает credentialed beacon mode', r.headers['access-control-allow-credentials'] === 'true');
r = await app.inject({ method: 'OPTIONS', url: '/ev', headers: { origin: 'https://evil.example' } });
check('CORS не отражает чужой origin', !r.headers['access-control-allow-origin']);

r = await get('/stats');
check('/stats закрыт без admin token', r.statusCode === 401, `код ${r.statusCode}`);
const stats = json(await get('/stats', admin));
check('/stats доступен администратору', typeof stats.open_game === 'number' && stats.open_game === 2, JSON.stringify(stats));
check('start rate считается по distinct sessions, а не по числу запусков игр', stats.funnel?.open_sessions === 2 && stats.funnel?.sessions_with_game === 1 && stats.funnel?.game_starts === 2 && stats.funnel?.start_rate_pct === 50, JSON.stringify(stats.funnel));
check('completion/replay/share funnel считается по раундам', stats.funnel?.completion_rate_pct === 50 && stats.funnel?.replay_rate_pct === 100 && stats.funnel?.share_rate_pct === 100, JSON.stringify(stats.funnel));
check('return signal входит в session funnel', stats.funnel?.returning_sessions === 1 && stats.funnel?.next_day_return_events === 1 && stats.funnel?.returning_session_share_pct === 50, JSON.stringify(stats.funnel));
check('per-game funnel сохраняет starts/finishes/replays/shares', stats.game_funnel?.merge?.starts === 2 && stats.game_funnel?.merge?.finishes === 1 && stats.game_funnel?.merge?.replays === 1 && stats.game_funnel?.merge?.shares === 1, JSON.stringify(stats.game_funnel));
const sevenDays = json(await get('/stats?days=7', admin));
check('/stats поддерживает валидное временное окно', sevenDays.window_days === 7);

r = await get('/export.csv');
check('/export.csv закрыт без admin token', r.statusCode === 401, `код ${r.statusCode}`);
r = await get('/export.csv', admin);
check('/export.csv доступен администратору', r.statusCode === 200 && r.body.startsWith('ts,uid_hash,session_id,game,action,value,sp'));
check('/export.csv не содержит сырого user_id', !r.body.includes('555'));
check('/export.csv содержит HMAC подписанного пользователя', r.body.includes(db.hashUid(555)));

r = await post('/forget', { user_id: 555 });
check('/forget не принимает self-asserted user_id', r.statusCode === 401, `код ${r.statusCode}`);
r = await post('/forget', { init_data: signed555 });
check('/forget принимает authenticated identity', r.statusCode === 200 && json(r).ok);
check('/forget удаляет подписчика', (await db.listSubscribers()).length === 0);
const csvAfterForget = (await get('/export.csv', admin)).body;
check('/forget стирает связанные pseudonymous events', !csvAfterForget.includes(db.hashUid(555)));

await app.close();
rmSync(TMP_DB, { force: true });
console.log('--- Проверки сервера ---');
for (const x of results) console.log(`${x.ok ? '✓' : '✗'} ${x.name}${!x.ok && x.detail ? ' → ' + x.detail : ''}`);
const failed = results.filter((x) => !x.ok).length;
if (failed) { console.error(`\nПровалено: ${failed} из ${results.length}.`); process.exit(1); }
console.log(`\nВсе ${results.length} проверок прошли.`);
