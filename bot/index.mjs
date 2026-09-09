#!/usr/bin/env node
import * as db from '../server/db.mjs';
import { createBot, commands } from './bot.mjs';
import { botStartConfig } from './runtime.mjs';

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('Нет BOT_TOKEN. Токен: business.max.ru → Чат-боты → Расширенные настройки');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && db.driver !== 'pg') {
  console.error('Production bot требует DATABASE_URL/Postgres: JSON storage небезопасен между server и bot процессами.');
  process.exit(1);
}

await db.init();
const bot = createBot();
bot.catch((err, ctx) => {
  console.error('Ошибка в обработчике:', ctx?.update?.update_type, err?.message || err);
});
try { await bot.api.setMyCommands(commands); }
catch (e) { console.error('Не удалось установить подсказки команд:', e?.message || e); }
console.log('Бот запущен');
await bot.start(botStartConfig());
