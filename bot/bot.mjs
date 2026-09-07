/**
 * Регистрация всех обработчиков бота. Ничего не запускает и не трогает сеть —
 * этим занимается bot/index.mjs. Разделение нужно, чтобы прогонять сценарии
 * в bot/smoke.mjs без токена и без обращений к Bot API.
 */
import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { ORG, SISTER_PROJECTS, WEBAPP_URL, BOT_USERNAME, ADMIN_IDS } from './config.mjs';
import { GAMES } from '../js/games.js';
import * as db from '../server/db.mjs';

/** Только те игры, что реально портированы — иначе кнопка ведёт в пустоту. */
const LIVE = GAMES.filter((g) => g.enabled);

const isAdmin = (uid) => !ADMIN_IDS.length || ADMIN_IDS.includes(Number(uid));

/* ── Клавиатуры ────────────────────────────────────────────────────────── */

/**
 * Ограничения платформы, проверенные по dev.max.ru:
 * до 210 кнопок, до 30 рядов, до 7 кнопок в ряду,
 * но не более 3 если это link / open_app / request_contact / request_geo_location.
 * Все ряды здесь намеренно не длиннее трёх кнопок, чтобы правило выполнялось
 * при любом их типе и при любом количестве проектов в кросс-промо.
 */
const openAppButton = (text) =>
  WEBAPP_URL ? Keyboard.button.openApp(text, WEBAPP_URL) : Keyboard.button.openApp(text);

/**
 * Глубокая ссылка сразу на игру. Это единственный документально подтверждённый
 * способ передать параметр внутрь мини-приложения MAX — payload попадает в
 * WebAppStartParam и initDataUnsafe.start_param.
 * Если ник бота не задан, отдаём кнопку открытия приложения без параметра:
 * пользователь попадёт в меню хаба, а не в пустоту.
 */
function playButton(g) {
  if (BOT_USERNAME) return Keyboard.button.link(`${g.emoji} ${g.title}`, `https://max.ru/${BOT_USERNAME}?startapp=g${g.id}`);
  return openAppButton(`${g.emoji} ${g.title}`);
}

function mainKeyboard() {
  const rows = [
    [openAppButton('🎮 Играть'), Keyboard.button.callback('Во что играть?', 'games')],
    [Keyboard.button.callback('🔔 Уведомить о запуске', 'notify')],
  ];

  const links = [];
  if (WEBAPP_URL) links.push(Keyboard.button.link('Открыть игротеку', WEBAPP_URL));
  // Не больше трёх кнопок-ссылок в ряду — жёсткое требование платформы.
  for (const p of SISTER_PROJECTS.slice(0, 2)) links.push(Keyboard.button.link(p.title, p.url));
  if (links.length) rows.push(links.slice(0, 3));

  rows.push([Keyboard.button.callback('Правовая информация', 'legal')]);
  return Keyboard.inlineKeyboard(rows);
}

function gamesKeyboard() {
  const rows = [];
  for (let i = 0; i < LIVE.length; i += 3) {
    rows.push(LIVE.slice(i, i + 3).map(playButton));
  }
  rows.push([Keyboard.button.callback('« Назад', 'menu')]);
  return Keyboard.inlineKeyboard(rows);
}

/* ── Тексты ────────────────────────────────────────────────────────────── */

const titles = LIVE.map((g) => `${g.emoji} ${g.title}`).join(', ');

const welcome = (name) =>
  `${name ? name + ', в' : 'В'}ы в игротеке — подборке коротких игр, в которые можно сыграть прямо в чате.\n\n` +
  `Сейчас доступны: ${titles}.\n\n` +
  `${ORG.ageRating} · без рекламы и покупок`;

const legalText =
  `Правовая информация\n\n` +
  `Оператор: ${ORG.name}, ИНН ${ORG.inn}\n` +
  `Политика обработки персональных данных: ${ORG.policyUrl}\n` +
  `Публичная оферта: ${ORG.offerUrl}\n` +
  `Поддержка: ${ORG.support}\n\n` +
  `Возрастная маркировка: ${ORG.ageRating}\n` +
  `Команда /forget — удалить все данные, которые мы о вас храним.`;

/* ── Отправка ──────────────────────────────────────────────────────────── */

/**
 * Ответ на нажатие кнопки обязан закрывать «песочные часы» — без вызова
 * answerOnCallback платформа держит кнопку в состоянии ожидания.
 * Ошибку глушим намеренно: упавший ответ не должен ронять весь апдейт.
 */
async function answer(ctx, text, attachments) {
  await ctx.reply(text, attachments ? { attachments } : {});
  if (ctx.callback) {
    try {
      await ctx.answerOnCallback({});
    } catch {
      /* кнопка уже не ждёт ответа — не страшно */
    }
  }
}

/* ── Регистрация ───────────────────────────────────────────────────────── */

export function createBot() {
  const bot = new Bot(process.env.BOT_TOKEN || 'stub');

  const track = (ctx, action, game) =>
    db.insertEvent({ uid_hash: db.hashUid(ctx.user?.user_id ?? 0), game, action });

  /** Игра, закодированная в payload: g<id> — тот же формат, что и в ?startapp=. */
  const gameFromPayload = (p) => {
    const m = /^g([a-z]{2,16})$/.exec(String(p || '').trim());
    return m ? LIVE.find((g) => g.id === m[1]) : null;
  };

  bot.command(/^start(?:\s+(\S+))?$/, async (ctx) => {
    await track(ctx, 'bot_start');
    const g = gameFromPayload(ctx.match?.[1]);
    if (g) {
      await track(ctx, 'bot_pick_game', g.id);
      return answer(ctx, `Вас звали сыграть в «${g.title}». Открывайте 👇`, [
        Keyboard.inlineKeyboard([[playButton(g)]]),
      ]);
    }
    await answer(ctx, welcome(ctx.user?.first_name), [mainKeyboard()]);
  });

  bot.on('bot_started', async (ctx) => {
    await track(ctx, 'bot_start');
    await answer(ctx, welcome(ctx.user?.first_name), [mainKeyboard()]);
  });

  bot.command('games', async (ctx) => answer(ctx, 'Выберите игру:', [gamesKeyboard()]));
  bot.command('legal', async (ctx) => answer(ctx, legalText));
  bot.command('help', async (ctx) => answer(ctx, legalText));

  bot.command('forget', async (ctx) => {
    if (ctx.user?.user_id) await db.forgetUser(ctx.user.user_id);
    await answer(ctx, 'Готово. Все ваши данные удалены.');
  });

  bot.action('menu', async (ctx) => answer(ctx, welcome(ctx.user?.first_name), [mainKeyboard()]));
  bot.action('games', async (ctx) => answer(ctx, 'Выберите игру:', [gamesKeyboard()]));
  bot.action('legal', async (ctx) => answer(ctx, legalText));

  bot.action('notify', async (ctx) => {
    const uid = ctx.user?.user_id;
    if (!uid) return;
    await db.addSubscriber({
      user_id: uid,
      uid_hash: db.hashUid(uid),
      game: null,
      // В callback-апдейте чат лежит не в update.chat_id, а выводится из сообщения.
      chat_id: Number(ctx.chatId) || null,
    });
    await track(ctx, 'notify_subscribe');
    await answer(ctx, 'Договорились. Напишем, когда выйдет полная версия — и пришлём игру сразу сюда.');
  });

  bot.action(/^play:(.+)$/, async (ctx) => {
    const g = LIVE.find((x) => x.id === ctx.match?.[1]);
    if (!g) return;
    await track(ctx, 'bot_pick_game', g.id);
    await answer(ctx, `Открывайте «${g.title}» 👇`, [
      Keyboard.inlineKeyboard([[playButton(g)]]),
    ]);
  });

  /* ── Рассылка ────────────────────────────────────────────────────────── */

  /**
   * Платформа пропускает не более двух сообщений в секунду в один диалог.
   * Разным людям можно чаще, но идём с запасом: 60 мс между отправками
   * и пауза на 429. Без очереди рассылка на 300 человек ловит лимит гарантированно.
   */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function broadcast(text, attachments) {
    const subs = await db.listSubscribers();
    let sent = 0;
    let failed = 0;
    for (const s of subs) {
      try {
        await bot.api.sendMessageToUser(Number(s.user_id), text, attachments ? { attachments } : {});
        sent++;
      } catch (e) {
        failed++;
        if (String(e?.message || e).includes('429')) await sleep(1000);
      }
      await sleep(60);
    }
    return { total: subs.length, sent, failed };
  }

  bot.command('cast', async (ctx) => {
    if (!isAdmin(ctx.user?.user_id)) return answer(ctx, 'Недостаточно прав.');
    const text = (ctx.message?.body?.text || '').replace(/^\/cast\s*/, '').trim();
    if (!text) return answer(ctx, 'Формат: /cast Текст рассылки');
    const r = await broadcast(text);
    return answer(ctx, `Отправлено: ${r.sent} из ${r.total}. Ошибок: ${r.failed}.`);
  });

  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.user?.user_id)) return answer(ctx, 'Недостаточно прав.');
    const s = await db.stats();
    return answer(
      ctx,
      `Запусков бота: ${s.bot_start ?? 0}\n` +
        `Открытий игр: ${s.open_game ?? 0}\n` +
        `Доиграно: ${s.finish ?? 0}\n` +
        `Поделились: ${s.share_ok ?? 0}\n` +
        `Подписались на запуск: ${s.notify_subscribe ?? 0}\n` +
        `Всего подписчиков: ${s.subscribers ?? 0}`
    );
  });

  bot.on('message_created', async (ctx) => {
    const t = (ctx.message?.body?.text || '').trim();
    if (!t || t.startsWith('/')) return;
    // Любой текст, который не команда, — показываем меню. Молчащий бот
    // выглядит сломанным, а это напрямую бьёт по удержанию.
    await answer(ctx, 'Я умею только запускать игры 👇', [mainKeyboard()]);
  });

  return bot;
}

export const commands = [
  { name: 'games', description: 'Список игр' },
  { name: 'legal', description: 'Реквизиты и политика обработки данных' },
  { name: 'forget', description: 'Удалить мои данные' },
];

export { LIVE };
