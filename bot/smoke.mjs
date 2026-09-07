#!/usr/bin/env node
/**
 * Прогон сценариев бота без токена и без сети.
 *
 * Зачем: клавиатуры и обработчики — единственное место, где ошибка стоит
 * модерации и перевыпуска бота. Проверить их «на живую» можно только после
 * создания бота на платформе, а к тому моменту исправлять уже поздно.
 * Здесь используются настоящие Context и Keyboard из SDK, подменяется только
 * отправка.
 *
 * Запуск:  node bot/smoke.mjs
 */
import { Context } from '@maxhub/max-bot-api';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DB = join(ROOT, 'server', '.smoke-data.json');

process.env.HUB_JSON_DB = TMP_DB;
process.env.HUB_HASH_SALT = 'smoke-salt';
rmSync(TMP_DB, { force: true });

const db = await import('../server/db.mjs');
const { createBot, LIVE } = await import('./bot.mjs');
const { BOT_USERNAME, WEBAPP_URL } = await import('./config.mjs');

await db.init();
const bot = createBot();
const mw = bot.middleware();

/* ── Перехват отправки ─────────────────────────────────────────────────── */

const sent = [];
let callbacksAnswered = 0;

function makeCtx(update) {
  const ctx = new Context(update, {}, undefined);
  ctx.reply = async (text, extra = {}) => {
    sent.push({ text, attachments: extra.attachments || [] });
    return { body: { mid: 'stub' } };
  };
  ctx.answerOnCallback = async () => {
    callbacksAnswered++;
    return { success: true };
  };
  return ctx;
}

const run = async (update) => {
  const before = sent.length;
  await mw(makeCtx(update), async () => {});
  return sent.slice(before);
};

/* ── Проверка клавиатур по лимитам платформы ───────────────────────────── */

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
        const links = row.filter((b) => LINK_TYPES.has(b.type)).length;
        if (links > 3) problems.push(`${label}: ссылочных кнопок в ряду ${links} > 3`);
        for (const b of row) {
          if (!b.text) problems.push(`${label}: кнопка без текста (${b.type})`);
          if (b.type === 'link' && !/^https:\/\//.test(b.url || '')) {
            problems.push(`${label}: ссылка не https — ${b.url}`);
          }
          if (b.type === 'open_app' && b.web_app && !/^https:\/\//.test(b.web_app)) {
            problems.push(`${label}: web_app не https — ${b.web_app}`);
          }
        }
      }
    }
  }
}

/* ── Сценарии ──────────────────────────────────────────────────────────── */

const UID = 424242;
const user = { user_id: UID, first_name: 'Тест', is_bot: false };

const msg = (text) => ({
  update_type: 'message_created',
  message: { body: { mid: 'm1', text }, sender: user, recipient: { chat_id: 777, user_id: UID } },
});

const cb = (payload) => ({
  update_type: 'message_callback',
  callback: { callback_id: 'c1', payload, user, timestamp: Date.now() },
  message: { body: { mid: 'm1', text: '' }, recipient: { chat_id: 777, user_id: UID } },
});

/**
 * Порядок важен: /forget стирает данные этого пользователя, поэтому идёт
 * последним — иначе он обнулит состояние до проверок ниже.
 */
const cases = [
  ['/start', await run(msg('/start'))],
  ['bot_started', await run({ update_type: 'bot_started', chat_id: 777, user })],
  ['кнопка games', await run(cb('games'))],
  ['кнопка notify', await run(cb('notify'))],
  ['кнопка play:merge', await run(cb('play:merge'))],
  ['кнопка menu', await run(cb('menu'))],
  ['/games', await run(msg('/games'))],
  ['/legal', await run(msg('/legal'))],
  ['/stats', await run(msg('/stats'))],
  ['/cast без текста', await run(msg('/cast'))],
  ['левый текст', await run(msg('привет'))],
  ['/start g_merge', await run(msg('/start g_merge'))],
  ['/start с мусором', await run(msg('/start qwerty'))],
];

for (const [label, msgs] of cases) {
  checkKeyboard(label, msgs);
  const kb = msgs.some((m) => m.attachments.some((a) => a?.type === 'inline_keyboard'));
  console.log(
    `${msgs.length ? '✓' : '·'} ${label.padEnd(30)} ответов: ${msgs.length}${kb ? ', с клавиатурой' : ''}`
  );
}

/* ── Проверки состояния ────────────────────────────────────────────────── */

const results = [];
const expect = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

// «Уведомить о запуске» — ключевая метрика софт-лонча, должна реально писаться в БД.
const subs = await db.listSubscribers();
expect('подписчик записан', subs.length === 1 && Number(subs[0].user_id) === UID, `подписчиков: ${subs.length}`);

const stats = await db.stats();
expect('события пишутся', (stats.bot_start ?? 0) >= 2, `bot_start: ${stats.bot_start}`);
expect('подписка учтена в метриках', (stats.notify_subscribe ?? 0) === 1, `notify_subscribe: ${stats.notify_subscribe}`);

// В событиях не должно быть сырого user_id — только HMAC-хеш.
const rawLeak = JSON.stringify(await db.exportCsv()).includes(String(UID));
expect('сырой user_id не утекает в события', !rawLeak);

// Удаление по 152-ФЗ: /forget обязан стирать и подписку, и события.
await run(msg('/forget'));
const after = await db.listSubscribers();
expect('/forget удаляет подписчика', after.length === 0, `осталось: ${after.length}`);
const afterStats = await db.stats();
expect('/forget стирает и события', (afterStats.bot_start ?? 0) === 0, `bot_start после: ${afterStats.bot_start}`);

/* ── Итог ──────────────────────────────────────────────────────────────── */

console.log('\n--- Проверки ---');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ' (' + r.detail + ')' : ''}`);

if (problems.length) {
  console.log('\n--- Нарушения лимитов клавиатур ---');
  for (const p of [...new Set(problems)]) console.log('✗ ' + p);
}

console.log('\n--- Конфигурация ---');
console.log(`игр в меню: ${LIVE.length} (${LIVE.map((g) => g.id).join(', ')})`);
console.log(`ник бота: ${BOT_USERNAME || 'не задан → кнопки ведут в меню хаба, а не сразу в игру'}`);
console.log(`URL мини-приложения: ${WEBAPP_URL || 'не задан → кнопка «Играть» откроет приложение по умолчанию'}`);
console.log(`ответов на callback закрыто: ${callbacksAnswered}`);

const failed = results.filter((r) => !r.ok).length;
rmSync(TMP_DB, { force: true });

if (failed || problems.length) {
  console.error(`\nПровалено: ${failed} проверок, ${problems.length} нарушений.`);
  process.exit(1);
}
console.log('\nВсе сценарии прошли.');
