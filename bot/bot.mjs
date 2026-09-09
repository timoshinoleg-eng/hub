/**
 * Регистрация обработчиков MAX-бота. Сеть запускает bot/index.mjs.
 */
import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { ORG, SISTER_PROJECTS, WEBAPP_URL, BOT_USERNAME, ADMIN_IDS, NOTIFICATIONS_ENABLED } from './config.mjs';
import { GAMES } from '../js/games.js';
import * as db from '../server/db.mjs';

const LIVE = GAMES.filter((g) => g.enabled);

// Fail closed: отсутствие HUB_ADMIN_IDS никого не делает администратором.
const isAdmin = (uid) => ADMIN_IDS.length > 0 && ADMIN_IDS.includes(Number(uid));

const openAppButton = (text) =>
  WEBAPP_URL ? Keyboard.button.openApp(text, WEBAPP_URL) : Keyboard.button.openApp(text);

function playButton(g) {
  if (BOT_USERNAME) return Keyboard.button.link(`${g.emoji} ${g.title}`, `https://max.ru/${BOT_USERNAME}?startapp=g${g.id}`);
  return openAppButton(`${g.emoji} ${g.title}`);
}

function mainKeyboard() {
  const rows = [
    [openAppButton('🎮 Играть'), Keyboard.button.callback('Во что играть?', 'games')],
  ];
  if (NOTIFICATIONS_ENABLED) rows.push([Keyboard.button.callback('🔔 Уведомить о запуске', 'notify')]);
  const links = [];
  for (const p of SISTER_PROJECTS.slice(0, 2)) links.push(Keyboard.button.link(p.title, p.url));
  if (links.length) rows.push(links.slice(0, 3));
  rows.push([Keyboard.button.callback('Правовая информация', 'legal')]);
  return Keyboard.inlineKeyboard(rows);
}

function gamesKeyboard() {
  const rows = [];
  for (let i = 0; i < LIVE.length; i += 3) rows.push(LIVE.slice(i, i + 3).map(playButton));
  rows.push([Keyboard.button.callback('« Назад', 'menu')]);
  return Keyboard.inlineKeyboard(rows);
}

const titles = LIVE.map((g) => `${g.emoji} ${g.title}`).join(', ');
const welcome = (name) =>
  `${name ? name + ', в' : 'В'}ы в игротеке — подборке коротких игр, в которые можно сыграть прямо в чате.\n\n` +
  `Сейчас доступны: ${titles}.\n\n` +
  `${ORG.ageRating} · без рекламы и покупок`;

function legalText() {
  const details = [
    ORG.name && `Оператор: ${ORG.name}${ORG.inn ? `, ИНН ${ORG.inn}` : ''}`,
    ORG.policyUrl && `Политика обработки персональных данных: ${ORG.policyUrl}`,
    ORG.offerUrl && `Публичная оферта: ${ORG.offerUrl}`,
    ORG.support && `Поддержка: ${ORG.support}`,
  ].filter(Boolean);
  if (!details.length) return `Игротека не принимает подписки и не сохраняет данные пользователей.\n\nВозрастная маркировка: ${ORG.ageRating}`;
  return `Правовая информация\n\n${details.join('\n')}\n\nВозрастная маркировка: ${ORG.ageRating}\nКоманда /forget — удалить все данные, которые мы о вас храним.`;
}

async function answer(ctx, text, attachments) {
  await ctx.reply(text, attachments ? { attachments } : {});
  if (ctx.callback) {
    try { await ctx.answerOnCallback({}); } catch { /* callback уже закрыт */ }
  }
}

export function createBot() {
  const bot = new Bot(process.env.BOT_TOKEN || 'stub');

  // Обычная бот-аналитика не связывается с user_id. Identity хранится только
  // в subscribers после явного действия «Уведомить о запуске».
  const track = (ctx, action, game) =>
    db.insertEvent({ uid_hash: db.anonId(), game, action });

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
  bot.command('legal', async (ctx) => answer(ctx, legalText()));
  bot.command('help', async (ctx) => answer(ctx, legalText()));

  bot.command('forget', async (ctx) => {
    if (ctx.user?.user_id) await db.forgetUser(ctx.user.user_id);
    await answer(ctx, 'Готово. Все связанные с вашим аккаунтом данные удалены.');
  });

  bot.action('menu', async (ctx) => answer(ctx, welcome(ctx.user?.first_name), [mainKeyboard()]));
  bot.action('games', async (ctx) => answer(ctx, 'Выберите игру:', [gamesKeyboard()]));
  bot.action('legal', async (ctx) => answer(ctx, legalText()));

  bot.action('notify', async (ctx) => {
    if (!NOTIFICATIONS_ENABLED) return answer(ctx, 'Подписка на обновления пока недоступна.');
    const uid = ctx.user?.user_id;
    if (!uid) return;
    await db.addSubscriber({
      user_id: uid,
      uid_hash: db.hashUid(uid),
      game: null,
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
