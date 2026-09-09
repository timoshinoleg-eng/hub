#!/usr/bin/env node
import { Context } from '@maxhub/max-bot-api';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DB = join(ROOT, 'server', '.smoke-data.json');
const UID = 424242;

process.env.HUB_JSON_DB = TMP_DB;
process.env.HUB_HASH_SALT = 'smoke-hash-salt-0123456789abcdef0123456789abcdef';
process.env.HUB_ADMIN_IDS = String(UID);
process.env.HUB_NOTIFICATIONS_ENABLED = 'true';
rmSync(TMP_DB, { force: true });

const db = await import('../server/db.mjs');
const { createBot, LIVE } = await import('./bot.mjs');
const { BOT_USERNAME, WEBAPP_URL } = await import('./config.mjs');
await db.init();
const bot = createBot();
const mw = bot.middleware();

const sent = [];
let callbacksAnswered = 0;
function makeCtx(update) {
  const ctx = new Context(update, {}, undefined);
  ctx.reply = async (text, extra = {}) => {
    sent.push({ text, attachments: extra.attachments || [] });
    return { body: { mid: 'stub' } };
  };
  ctx.answerOnCallback = async () => { callbacksAnswered++; return { success: true }; };
  return ctx;
}
const run = async (update) => {
  const before = sent.length;
  await mw(makeCtx(update), async () => {});
  return sent.slice(before);
};

const LINK_TYPES = new Set(['link', 'open_app', 'request_contact', 'request_geo_location']);
const problems = [];
function checkKeyboard(label, msgs) {
  for (const m of msgs) {
    for (const att of m.attachments) {
      if (att?.type !== 'inline_keyboard') continue;
      const rows = att.payload?.buttons || [];
      if (rows.length > 30) problems.push(`${label}: рядов ${rows.length} > 30`);
      for (const row of rows) {
        if (row.length > 7) problems.push(`${label}: кнопок в ряду ${row.length} > 7`);
        if (row.filter((b) => LINK_TYPES.has(b.type)).length > 3) problems.push(`${label}: >3 ссылочных кнопок`);
        for (const b of row) {
          if (!b.text) problems.push(`${label}: кнопка без текста (${b.type})`);
          if (b.type === 'link' && !/^https:\/\//.test(b.url || '')) problems.push(`${label}: ссылка не https — ${b.url}`);
          if (b.type === 'open_app' && b.web_app && !/^https:\/\//.test(b.web_app)) problems.push(`${label}: web_app не https — ${b.web_app}`);
        }
      }
    }
  }
}

const user = { user_id: UID, first_name: 'Тест', is_bot: false };
const msgAs = (text, u = user) => ({
  update_type: 'message_created',
  message: { body: { mid: 'm1', text }, sender: u, recipient: { chat_id: 777, user_id: u.user_id } },
});
const cb = (payload) => ({
  update_type: 'message_callback',
  callback: { callback_id: 'c1', payload, user, timestamp: Date.now() },
  message: { body: { mid: 'm1', text: '' }, recipient: { chat_id: 777, user_id: UID } },
});

const cases = [
  ['/start', await run(msgAs('/start'))],
  ['bot_started', await run({ update_type: 'bot_started', chat_id: 777, user })],
  ['кнопка games', await run(cb('games'))],
  ['кнопка notify', await run(cb('notify'))],
  ['кнопка play:merge', await run(cb('play:merge'))],
  ['кнопка menu', await run(cb('menu'))],
  ['/games', await run(msgAs('/games'))],
  ['/legal', await run(msgAs('/legal'))],
  ['/stats admin', await run(msgAs('/stats'))],
  ['/cast без текста', await run(msgAs('/cast'))],
  ['левый текст', await run(msgAs('привет'))],
  ['/start g_merge', await run(msgAs('/start g_merge'))],
  ['/start с мусором', await run(msgAs('/start qwerty'))],
];
for (const [label, msgs] of cases) {
  checkKeyboard(label, msgs);
  const kb = msgs.some((m) => m.attachments.some((a) => a?.type === 'inline_keyboard'));
  console.log(`${msgs.length ? '✓' : '·'} ${label.padEnd(30)} ответов: ${msgs.length}${kb ? ', с клавиатурой' : ''}`);
}

const results = [];
const expect = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });
const subs = await db.listSubscribers();
expect('подписчик записан', subs.length === 1 && Number(subs[0].user_id) === UID, `подписчиков: ${subs.length}`);
const stats = await db.stats();
expect('события пишутся', (stats.bot_start ?? 0) >= 2, `bot_start: ${stats.bot_start}`);
expect('подписка учтена', (stats.notify_subscribe ?? 0) === 1, `notify_subscribe: ${stats.notify_subscribe}`);
expect('сырой user_id не утекает в события', !JSON.stringify(await db.exportCsv()).includes(String(UID)));

const outsider = { user_id: UID + 1, first_name: 'Чужой', is_bot: false };
const denied = await run(msgAs('/stats', outsider));
expect('неадмин не получает /stats', denied.some((m) => /Недостаточно прав/.test(m.text || '')));

await run(msgAs('/forget'));
expect('/forget удаляет подписчика', (await db.listSubscribers()).length === 0);
expect('анонимная аналитика после /forget остаётся несвязанной', (await db.stats()).bot_start >= 2);

console.log('\n--- Проверки ---');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ' (' + r.detail + ')' : ''}`);
if (problems.length) for (const p of [...new Set(problems)]) console.log('✗ ' + p);
console.log('\n--- Конфигурация ---');
console.log(`игр в меню: ${LIVE.length} (${LIVE.map((g) => g.id).join(', ')})`);
console.log(`ник бота: ${BOT_USERNAME || 'не задан'}`);
console.log(`URL мини-приложения: ${WEBAPP_URL || 'не задан'}`);
console.log(`ответов на callback закрыто: ${callbacksAnswered}`);

const failed = results.filter((r) => !r.ok).length;
rmSync(TMP_DB, { force: true });
if (failed || problems.length) {
  console.error(`\nПровалено: ${failed} проверок, ${problems.length} нарушений.`);
  process.exit(1);
}
console.log('\nВсе сценарии прошли.');
