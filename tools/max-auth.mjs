#!/usr/bin/env node
import { createHmac } from 'node:crypto';
import { verifyMaxInitData } from '../server/max-auth.mjs';

const BOT_TOKEN = 'auth-test-token';
const now = 1_800_000_000;

function sign(fields, token = BOT_TOKEN) {
  const launch = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(launch).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const valid = sign({
  auth_date: String(now - 60),
  query_id: 'query-1',
  start_param: 'gmerge_s10',
  user: JSON.stringify({ id: 67890, first_name: 'Max' }),
});

let fails = 0;
function ok(cond, msg) {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) fails++;
}

let r = verifyMaxInitData(valid, { botToken: BOT_TOKEN, nowSeconds: now, maxAgeSeconds: 3600 });
ok(r.ok && r.user.id === 67890 && r.startParam === 'gmerge_s10', 'валидная подпись принимается');

r = verifyMaxInitData(valid.replace('67890', '67891'), { botToken: BOT_TOKEN, nowSeconds: now, maxAgeSeconds: 3600 });
ok(!r.ok, 'изменённые данные отклоняются');

r = verifyMaxInitData(sign({ auth_date: String(now - 7200), user: JSON.stringify({ id: 1 }) }), { botToken: BOT_TOKEN, nowSeconds: now, maxAgeSeconds: 3600 });
ok(!r.ok && r.reason === 'auth_date_expired', 'просроченный initData отклоняется');

r = verifyMaxInitData(valid + '&hash=' + '0'.repeat(64), { botToken: BOT_TOKEN, nowSeconds: now, maxAgeSeconds: 3600 });
ok(!r.ok && r.reason === 'duplicate_key', 'дубли ключей отклоняются');

r = verifyMaxInitData(valid, { botToken: 'wrong-token', nowSeconds: now, maxAgeSeconds: 3600 });
ok(!r.ok && r.reason === 'bad_hash', 'неверный bot token не валидирует пользователя');

if (fails) {
  console.error(`\nПровалено: ${fails}`);
  process.exit(1);
}
console.log('\nMAX initData validation проходит контрактные проверки.');
