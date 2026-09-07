#!/usr/bin/env node
/**
 * Точка входа бота. Только инфраструктура: токен, БД, запуск polling.
 * Сами сценарии — в bot/bot.mjs.
 *
 * Запуск:  BOT_TOKEN=... node bot/index.mjs
 */
import * as db from '../server/db.mjs';
import { createBot, commands } from './bot.mjs';

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('Нет BOT_TOKEN. Токен: business.max.ru → Чат-боты → Перейти → Расширенные настройки → Настроить');
  process.exit(1);
}

await db.init();

const bot = createBot();

/**
 * По умолчанию библиотека завершает процесс при любой необработанной ошибке.
 * Для бота, который должен жить неделями, это худшее поведение: один битый
 * апдейт роняет всё. Логируем и продолжаем.
 */
bot.catch((err, ctx) => {
  console.error('Ошибка в обработчике:', ctx?.update?.update_type, err?.message || err);
});

try {
  await bot.api.setMyCommands(commands);
} catch (e) {
  // Не критично: подсказки команд — украшение, без них бот работает.
  console.error('Не удалось установить подсказки команд:', e?.message || e);
}

console.log('Бот запущен');
await bot.start();
